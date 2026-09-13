type Invoke = (
  operation: string,
  payload?: Record<string, unknown>,
) => Promise<any>;
type VoiceOptions = {
  invoke: Invoke;
  onStatus: (status: string) => void;
  onTranscript: (role: "user" | "assistant", text: string) => void;
  onError: (error: string) => void;
};
export function createVoiceSession(options: VoiceOptions) {
  let peer: RTCPeerConnection | null = null,
    stream: MediaStream | null = null,
    channel: RTCDataChannel | null = null;
  let audio: HTMLAudioElement | null = null,
    active = false,
    epoch = 0;
  let cutoff: ReturnType<typeof setTimeout> | null = null;
  const callIds = new Set<string>();
  function stop() {
    epoch++;
    active = false;
    if (cutoff) clearTimeout(cutoff);
    stream?.getTracks().forEach((t) => t.stop());
    channel?.close();
    peer?.close();
    if (audio) {
      audio.pause();
      audio.srcObject = null;
      audio.remove();
    }
    peer = null;
    stream = null;
    channel = null;
    audio = null;
    callIds.clear();
    options.onStatus("idle");
  }
  async function start() {
    if (active) {
      stop();
      return;
    }
    const generation = ++epoch;
    active = true;
    options.onStatus("connecting");
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error(
          "Mikrofon nicht verfügbar. Bitte die Desktop-App verwenden.",
        );
      const acquired = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      if (generation !== epoch) {
        acquired.getTracks().forEach((t) => t.stop());
        return;
      }
      stream = acquired;
      peer = new RTCPeerConnection();
      audio = document.createElement("audio");
      audio.autoplay = true;
      document.body.appendChild(audio);
      peer.ontrack = (e) => {
        if (audio) {
          audio.srcObject = e.streams[0];
          audio
            .play()
            .catch(() =>
              options.onError(
                "Audiowiedergabe blockiert. Bitte erneut auf Sprache klicken.",
              ),
            );
        }
      };
      stream.getTracks().forEach((track) => peer?.addTrack(track, stream!));
      peer.onconnectionstatechange = () => {
        if (peer?.connectionState === "failed") {
          options.onError(
            "Sprachverbindung unterbrochen. Bitte erneut verbinden.",
          );
          stop();
        }
      };
      channel = peer.createDataChannel("oai-events");
      const send = (data: unknown) => {
        if (channel?.readyState === "open") channel.send(JSON.stringify(data));
      };
      channel.onopen = () => {
        options.onStatus("listening");
        cutoff = setTimeout(
          () => {
            options.onError(
              "Sprachsitzung nach 15 Minuten beendet. Bei Bedarf neu starten.",
            );
            stop();
          },
          15 * 60 * 1000,
        );
      };
      channel.onmessage = async (event) => {
        let data;
        try {
          data = JSON.parse(event.data);
        } catch {
          return;
        }
        if (data.type === "input_audio_buffer.speech_started")
          options.onStatus("listening");
        if (data.type === "input_audio_buffer.speech_stopped")
          options.onStatus("thinking");
        if (
          data.type === "response.output_audio.delta" ||
          data.type === "response.audio.delta"
        )
          options.onStatus("speaking");
        if (data.type === "response.done") options.onStatus("listening");
        if (
          data.type === "conversation.item.input_audio_transcription.completed"
        )
          options.onTranscript("user", data.transcript);
        if (
          [
            "response.output_audio_transcript.done",
            "response.audio_transcript.done",
          ].includes(data.type)
        )
          options.onTranscript("assistant", data.transcript);
        if (data.type === "error") {
          options.onError(
            data.error?.message || "Sprachverbindung fehlgeschlagen.",
          );
          stop();
        }
        if (
          data.type === "response.function_call_arguments.done" &&
          data.name === "aegis_command" &&
          !callIds.has(data.call_id)
        ) {
          callIds.add(data.call_id);
          options.onStatus("thinking");
          let result;
          try {
            const args = JSON.parse(data.arguments);
            result = await options.invoke("chat", { message: args.message });
          } catch (err) {
            result = {
              error:
                err instanceof Error ? err.message : "Aktion fehlgeschlagen",
            };
          }
          if (generation !== epoch) return;
          send({
            type: "conversation.item.create",
            item: {
              type: "function_call_output",
              call_id: data.call_id,
              output: JSON.stringify(result),
            },
          });
          send({ type: "response.create" });
        }
      };
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      const result = await options.invoke("realtime.session", {
        sdp: offer.sdp,
      });
      if (generation !== epoch) return;
      await peer.setRemoteDescription({ type: "answer", sdp: result.sdp });
    } catch (error) {
      if (generation !== epoch) return;
      options.onError(
        error instanceof Error
          ? error.message
          : "Sprache konnte nicht gestartet werden.",
      );
      stop();
    }
  }
  return {
    start,
    stop,
    setMuted: (muted: boolean) =>
      stream?.getAudioTracks().forEach((track) => {
        track.enabled = !muted;
      }),
  };
}
