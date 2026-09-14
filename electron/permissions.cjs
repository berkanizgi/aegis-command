// Only the trusted, top-level Aegis renderer receives microphone access.
// This does not change Windows privacy settings or grant access to websites.
function installAudioPermissions(ses, trusted, trustedUrl) {
  const ownFrame = (wc, details = {}) =>
    Boolean(
      trusted(wc) &&
      details.isMainFrame !== false &&
      (!details.requestingUrl || trustedUrl(details.requestingUrl)),
    );
  const request = (wc, permission, callback, details = {}) =>
    callback(
      Boolean(
        permission === "media" &&
        ownFrame(wc, details) &&
        Array.isArray(details.mediaTypes) &&
        details.mediaTypes.length > 0 &&
        details.mediaTypes.every((type) => type === "audio"),
      ),
    );
  const check = (wc, permission, origin, details = {}) =>
    Boolean(
      permission === "media" &&
      ownFrame(wc, details) &&
      details.mediaType === "audio",
    );
  ses.setPermissionRequestHandler(request);
  ses.setPermissionCheckHandler(check);
  return { request, check };
}
module.exports = { installAudioPermissions };
