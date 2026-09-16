// Window placement is independent of the renderer and of model/tool calls.
function createDisplayManager({ screen, primary, createSecondary, changed }) {
  let secondary = null,
    secondaryId = null,
    primaryId = null;
  let preferences = { launchFullscreen: true, useSecondDisplay: true };
  let dismissed = false,
    disposed = false;
  const state = () => ({
    connected: screen.getAllDisplays().length,
    secondaryActive: !!secondary && !secondary.isDestroyed(),
    primaryId,
    secondaryId,
  });
  const announce = () => changed(state());
  function place(window, bounds, fullscreen) {
    const current = window.getBounds();
    const moved = ["x", "y", "width", "height"].some(
      (key) => current[key] !== bounds[key],
    );
    if (moved) {
      if (window.isFullScreen()) window.setFullScreen(false);
      window.setBounds(bounds);
    }
    if (window.isFullScreen() !== fullscreen) window.setFullScreen(fullscreen);
  }
  function release() {
    const old = secondary;
    secondary = null;
    secondaryId = null;
    announce(); // Reparent the source reader BEFORE destroying its old window.
    if (old && !old.isDestroyed()) old.destroy();
  }
  function sync(initial = false) {
    if (disposed || !primary()) return;
    const main = primary(),
      first = screen.getPrimaryDisplay();
    if (initial || primaryId !== first.id) {
      place(
        main,
        preferences.launchFullscreen ? first.bounds : first.workArea,
        preferences.launchFullscreen,
      );
    }
    primaryId = first.id;
    const second = screen.getAllDisplays().find((d) => d.id !== first.id);
    if (!preferences.useSecondDisplay || !second || dismissed) {
      if (secondary) release();
      announce();
      return;
    }
    if (secondary && secondaryId !== second.id) release();
    if (!secondary) {
      secondaryId = second.id;
      const window = createSecondary(second);
      secondary = window;
      window.on("closed", () => {
        if (secondary !== window) return;
        secondary = null;
        secondaryId = null;
        dismissed = true;
        announce();
      });
      // Move the reader before a user closes this surface.
      window.on("close", () => {
        if (secondary === window) {
          secondary = null;
          secondaryId = null;
          dismissed = true;
          announce();
        }
      });
    }
    place(secondary, second.bounds, preferences.launchFullscreen);
    announce();
  }
  const update = () => sync();
  for (const event of [
    "display-added",
    "display-removed",
    "display-metrics-changed",
  ])
    screen.on(event, update);
  return {
    state,
    secondary: () => secondary,
    informationHost: () => secondary || primary(),
    configure(value) {
      const next = {
        launchFullscreen: value.launchFullscreen !== false,
        useSecondDisplay: value.useSecondDisplay !== false,
      };
      if (next.useSecondDisplay !== preferences.useSecondDisplay)
        dismissed = false;
      const resetMain =
        primaryId === null ||
        next.launchFullscreen !== preferences.launchFullscreen;
      preferences = next;
      sync(resetMain);
    },
    show() {
      secondary?.showInactive();
      primary()?.show();
    },
    hide() {
      secondary?.hide();
      primary()?.hide();
    },
    close() {
      disposed = true;
      for (const event of [
        "display-added",
        "display-removed",
        "display-metrics-changed",
      ])
        screen.removeListener(event, update);
      release();
    },
  };
}

// The information surface cannot start AI sessions, edit settings, or run missions.
function informationOperationAllowed(operation, payload = {}) {
  if (
    [
      "state",
      "mail.reply.prepare",
      "mail.reply.update",
      "mail.reply.clear",
      "mail.reply.save",
    ].includes(operation)
  )
    return true;
  return (
    operation === "tools.execute" &&
    [
      "world_weather",
      "world_map",
      "world_markets",
      "world_search",
      "world_mail",
      "world_view",
    ].includes(payload.name)
  );
}
module.exports = { createDisplayManager, informationOperationAllowed };
