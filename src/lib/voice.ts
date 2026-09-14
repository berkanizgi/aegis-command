type Invoke = (
  operation: string,
  payload?: Record<string, unknown>,
) => Promise<any>;
type VoiceOptions = {
  invoke: Invoke;
  onStatus: (status: string) => void;
  onTranscript: (role: "user" | "assistant", text: string) => void;
  onError: (error: string) => void;
  onAudioLevel?: (level: number) => void;
};
export function createVoiceSession(options: VoiceOptions) {
  let peer: RTCPeerConnection | null = null,
    stream: MediaStream | null = null,
    channel: RTCDataChannel | null = null;
  let audio: HTMLAudioElement | null = null,
    active = false,
    epoch = 0;
  let cutoff: ReturnType<typeof setTimeout> | null = null;
  let connectingTimeout: ReturnType<typeof setTimeout> | null = null;
  let audioContext: AudioContext | null = null;
  let audioSource: MediaStreamAudioSourceNode | null = null;
  let analyser: AnalyserNode | null = null;
  let meterFrame = 0;
  const callIds = new Set<string>();
  const usageIds = new Set<string>();
  function stop() {
    epoch++;
    active = false;
    if (cutoff) clearTimeout(cutoff);
    if (connectingTimeout) clearTimeout(connectingTimeout);
    cutoff = null;
    connectingTimeout = null;
    cancelAnimationFrame(meterFrame);
    audioSource?.disconnect();
    analyser?.disconnect();
    void audioContext?.close().catch(() => {});
    audioSource = null;
    analyser = null;
    audioContext = null;
    options.onAudioLevel?.(0);
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
    usageIds.clear();
    options.onStatus("idle");
  }
  async function start() {
    if (active) return;
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
      const connection = peer;
      let greetingInstructions = "";
      let greetingSent = false;
      let sessionReady = false;
      let playing = false;
      let responseInFlight = false,
        pendingTools = 0,
        continuationNeeded = false;
      const current = () => generation === epoch;
      const fail = (message: string) => {
        if (!current()) return;
        stop();
        options.onError(message);
      };
      connectingTimeout = setTimeout(
        () => fail("Sprachverbindung dauert zu lange. Bitte erneut starten."),
        45000,
      );
      audio = document.createElement("audio");
      audio.autoplay = true;
      document.body.appendChild(audio);
      peer.ontrack = (e) => {
        if (!current()) return;
        if (audio) {
          const remoteStream = e.streams[0] || new MediaStream([e.track]);
          audio.srcObject = remoteStream;
          audio
            .play()
            .catch(() =>
              fail(
                "Audiowiedergabe blockiert. Bitte erneut auf Sprache klicken.",
              ),
            );
          // Analyse the real remote audio; playback remains on the audio element.
          // Never route it to the AudioContext destination (would play it twice).
          if (!audioContext && typeof AudioContext !== "undefined") {
            try {
              audioContext = new AudioContext();
              analyser = audioContext.createAnalyser();
              analyser.fftSize = 256;
              audioSource = audioContext.createMediaStreamSource(remoteStream);
              audioSource.connect(analyser);
              void audioContext.resume().catch(() => {});
              const samples = new Uint8Array(analyser.fftSize);
              const meter = () => {
                if (!current() || !analyser) return;
                analyser.getByteTimeDomainData(samples);
                let energy = 0;
                for (const sample of samples)
                  energy += ((sample - 128) / 128) ** 2;
                options.onAudioLevel?.(
                  Math.min(1, Math.sqrt(energy / samples.length) * 5),
                );
                meterFrame = requestAnimationFrame(meter);
              };
              meter();
            } catch {
              /* Voice still works if this device cannot expose an audio meter. */
            }
          }
        }
      };
      stream.getTracks().forEach((track) => peer?.addTrack(track, stream!));
      peer.onconnectionstatechange = () => {
        if (!current()) return;
        if (connection.connectionState === "failed")
          fail("Sprachverbindung unterbrochen. Bitte erneut verbinden.");
      };
      channel = peer.createDataChannel("oai-events");
      const send = (data: unknown) => {
        if (current() && channel?.readyState === "open")
          channel.send(JSON.stringify(data));
      };
      const continueAfterTools = () => {
        if (
          current() &&
          continuationNeeded &&
          pendingTools === 0 &&
          !responseInFlight
        ) {
          continuationNeeded = false;
          responseInFlight = true;
          send({ type: "response.create" });
        }
      };
      const greet = () => {
        if (
          !current() ||
          greetingSent ||
          !sessionReady ||
          !greetingInstructions ||
          channel?.readyState !== "open"
        )
          return;
        greetingSent = true;
        responseInFlight = true;
        send({
          type: "response.create",
          response: { instructions: greetingInstructions, tool_choice: "none" },
        });
      };
      channel.onopen = () => {
        if (!current()) return;
        if (connectingTimeout) clearTimeout(connectingTimeout);
        options.onStatus("listening");
        greet();
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
        if (!current()) return;
        let data;
        try {
          data = JSON.parse(event.data);
        } catch {
          return;
        }
        if (data.type === "session.created") {
          sessionReady = true;
          greet();
        }
        if (data.type === "output_audio_buffer.started") {
          playing = true;
          options.onStatus("speaking");
        }
        if (
          [
            "output_audio_buffer.stopped",
            "output_audio_buffer.cleared",
          ].includes(data.type)
        ) {
          playing = false;
          options.onStatus("listening");
        }
        if (data.type === "response.created") {
          responseInFlight = true;
          if (!playing) options.onStatus("thinking");
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
        // Generation may finish before the WebRTC audio has finished playing.
        if (data.type === "response.done") {
          responseInFlight = false;
          const usage = data.response?.usage;
          const usageId = data.response?.id;
          if (usage && (!usageId || !usageIds.has(usageId))) {
            if (usageId) usageIds.add(usageId);
            void options
              .invoke("usage.realtime", {
                realtimeInputTextTokens:
                  usage.input_token_details?.text_tokens || 0,
                realtimeInputAudioTokens:
                  usage.input_token_details?.audio_tokens || 0,
                realtimeCachedTokens:
                  usage.input_token_details?.cached_tokens || 0,
                realtimeOutputTextTokens:
                  usage.output_token_details?.text_tokens || 0,
                realtimeOutputAudioTokens:
                  usage.output_token_details?.audio_tokens || 0,
              })
              .catch(() => {});
          }
          if (!playing)
            options.onStatus(pendingTools ? "thinking" : "listening");
          continueAfterTools();
        }
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
          fail(data.error?.message || "Sprachverbindung fehlgeschlagen.");
        }
        if (
          data.type === "response.function_call_arguments.done" &&
          [
            "aegis_command",
            "aegis_status",
            "world_weather",
            "world_map",
            "world_markets",
            "world_search",
            "world_mail",
            "world_mail_reply",
            "world_view",
          ].includes(data.name) &&
          !callIds.has(data.call_id)
        ) {
          callIds.add(data.call_id);
          pendingTools++;
          options.onStatus("thinking");
          let result;
          try {
            const args = JSON.parse(data.arguments);
            result =
              data.name === "aegis_status"
                ? await options.invoke("app.overview")
                : data.name.startsWith("world_")
                  ? await options.invoke("tools.execute", {
                      name: data.name,
                      args,
                    })
                  : await options.invoke("chat", { message: args.message });
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
          pendingTools--;
          continuationNeeded = true;
          continueAfterTools();
        }
      };
      const offer = await connection.createOffer();
      if (!current()) return;
      await connection.setLocalDescription(offer);
      if (!current()) return;
      const result = await options.invoke("realtime.session", {
        sdp: offer.sdp,
      });
      if (generation !== epoch) return;
      greetingInstructions = result.greetingInstructions || "";
      await connection.setRemoteDescription({
        type: "answer",
        sdp: result.sdp,
      });
      greet();
    } catch (error) {
      if (generation !== epoch) return;
      stop();
      options.onError(
        error instanceof Error && error.name === "NotAllowedError"
          ? "Windows oder das Mikrofon hat den Zugriff abgelehnt. In Windows → Datenschutz & Sicherheit → Mikrofon den Zugriff für Desktop-Apps erlauben. Aegis selbst fragt nicht bei jedem Start erneut."
          : error instanceof Error
            ? error.message
            : "Sprache konnte nicht gestartet werden.",
      );
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
