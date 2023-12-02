import Html, { Children } from "@kitajs/html";
import { Button } from "../components/Button";
import { X25519SecretKey } from "sodium-plus";
import { CustomWait, syncify } from "./syncify";
import {
  getConfig,
  maxVideoBitrateValue,
  minVideoBitrateValue,
  setConfig,
} from "./Config";
import {
  KeyPair,
  decrypt,
  encrypt,
  generateKeyPair,
  loadKeyPairFromLocalStorage,
  reconstructKeyPairFromSecret,
  storeKeyPairToLocalStorage,
} from "../types/KeyPair";
import SimplePeer from "simple-peer";
import { AppInitializer } from "../components/AppInitializer";

// Ability to disable the video so it does not consume so much resources.
const disableVideo = { sender: false, receiver: false };

type SimplePeerEncoding = {
  maxBitrate?: number;
};

type SimplePeerParameters = { encodings: Array<SimplePeerEncoding> };

type SimplePeerSender = {
  track: MediaStreamTrack;
  getParameters: () => SimplePeerParameters;
  setParameters: (parameters: SimplePeerParameters) => Promise<void>;
};

type SimplePeerPc = {
  getSenders: () => SimplePeerSender[];
};

function getSimplePeerPc(peer: SimplePeer.Instance): SimplePeerPc | undefined {
  if ("_pc" in peer) {
    return peer._pc as SimplePeerPc;
  }
}

function getFromHash(key: string): string | undefined {
  const hash = location.hash.split("#")[1];
  if (!hash) return;

  const ampersandSplit = hash.split("&");
  for (const item of ampersandSplit) {
    const equalsSplit = item.split("=");
    const itemKey = equalsSplit[0];
    const itemValue = equalsSplit[1];
    if (key === itemKey) {
      return itemValue;
    }
  }
}

function initialVideoDevice(videoDevices: MediaDeviceInfo[]) {
  const videoInputDeviceConfig = getConfig("videoInputDevice", []);
  while (true) {
    const invalidIndex = videoInputDeviceConfig.findIndex(
      (x) => typeof x.label !== "string" || typeof x.autoSelected !== "boolean",
    );
    if (invalidIndex < 0) break;
    videoInputDeviceConfig.splice(invalidIndex, 1);
  }
  const initialSelection = (function () {
    const prefiltered = videoInputDeviceConfig.flatMap((config, index) => {
      const videoDevice = videoDevices.find(
        (videoDevice) => videoDevice.label == config.label,
      );
      if (!videoDevice) return [];
      return [{ index, label: videoDevice.label, auto: config.autoSelected }];
    });
    const first: MediaDeviceInfo | undefined = videoDevices[0];
    return (
      prefiltered.find((x) => !x.auto) ??
      prefiltered.find((x) => x.auto) ??
      (first
        ? {
            index: 0,
            auto: true,
            label: first.label,
          }
        : undefined)
    );
  })();
  if (
    initialSelection?.auto &&
    videoInputDeviceConfig.findIndex(
      (x) => x.label === initialSelection.label,
    ) === -1
  ) {
    videoInputDeviceConfig.push({
      label: initialSelection.label,
      autoSelected: true,
    });
    setConfig("videoInputDevice", videoInputDeviceConfig);
  }
  return initialSelection;
}

function changeVideoDevice(videoDevice: MediaDeviceInfo | undefined) {
  if (videoDevice) {
    const videoInputDeviceConfig = getConfig("videoInputDevice", []);
    const index = videoInputDeviceConfig.findIndex(
      (x) => x.label === videoDevice.label,
    );
    if (index >= 0) {
      videoInputDeviceConfig.splice(index, 1);
    }
    videoInputDeviceConfig.unshift({
      label: videoDevice.label,
      autoSelected: false,
    });
    setConfig("videoInputDevice", videoInputDeviceConfig);
    return index !== 0;
  }
  return false;
}

type MediaStreamInfo = {
  mediaStream: MediaStream;
  deviceInfo?: MediaDeviceInfo;
};

let videoMediaStream: MediaStreamInfo | null = null;

async function getMediaStream(
  videoDevice: MediaDeviceInfo | null,
): Promise<MediaStreamInfo | null> {
  if (!videoDevice) return null;
  if (videoMediaStream?.deviceInfo === videoDevice) {
    return videoMediaStream;
  }

  /* open the device you want */
  const constraints = {
    audio: true,
    video: {
      deviceId: videoDevice.deviceId,
      aspectRatio: 1920 / 1080,
      width: 1920,
      height: 1080,
    },
  };
  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  return { mediaStream: stream, deviceInfo: videoDevice };
}

export const App = function () {
  function call(
    name: keyof ReturnType<typeof App>,
    withJsPrefix: boolean = true,
  ): string {
    return withJsPrefix ? `js:app.${name}` : `app.${name}`;
  }

  let keyPair: KeyPair | undefined;

  async function initReceiver(): Promise<string | undefined> {
    const secretKeyText = getFromHash("key");
    if (!secretKeyText) return;

    try {
      keyPair = await reconstructKeyPairFromSecret(
        X25519SecretKey.from(secretKeyText, "hex"),
      );
      if (!keyPair) throw new Error("Invalid key");
    } catch (ex: unknown) {
      return <span style={{ color: "red" }}>{ex}</span>;
    }

    const connId = keyPair.publicKey.toString("hex");
    // If we have a secret key, we must construct
    // the public key, fetch the offer and answer it.
    return String(
      <div
        hx-ext="sse"
        sse-connect={`/connections/${connId}/receiver-events`}
        class="receiver-main"
      >
        <div id="video-preview-container" />
        <div id="receiver-id" sse-swap="receiver-id" />
        <span id="status" />
        <div id="offer-waiting" sse-swap="offer" />
      </div>,
    );
  }

  let receiverId: number | undefined;

  async function acceptReceiverId(id: number): Promise<string> {
    receiverId = id;

    updateStatus(
      `ReceiverId set to ${id}. Waiting for sender to provide the offer.\r\n\r\n\r\nIf it takes longer, try to share the link from the sender again.`,
    );

    return "";
  }

  let senderOffer: SimplePeer.SignalData | undefined;
  let receiverAnswer: SimplePeer.SignalData | undefined;

  async function acceptOffer(encryptedOffer: string): Promise<string> {
    updateStatus("Offer obtained");

    if (!keyPair) {
      return String(
        <span style={{ color: "red" }}>
          Error: Accept offer got called before the keypair got initialized
        </span>,
      );
    }

    const offer: SimplePeer.SignalData | undefined = JSON.parse(
      await decrypt(keyPair, encryptedOffer),
    );
    if (offer?.type !== "offer") {
      return String(
        <span style={{ color: "red" }}>
          Error: SignalData was not an offer.
        </span>,
      );
    }

    if (senderOffer !== offer) {
      if (peer) {
        log("acceptOffer: peer.destroy()");
        peer.destroy();
        peer = null;
      }
    }

    senderOffer = offer;

    updatePeer("receiver");

    updateStatus("Offer obtained, answering...");

    return String(
      <div>
        <div id="send-signal-container" />
        <div id="send-offer-request-container" />
        <div class="log-header">Log</div>
        <div id="messages">{renderMessages(messages)}</div>
      </div>,
    );
  }

  async function acceptAnswer(encryptedAnswer: string): Promise<string> {
    updateStatus("Answer obtained");

    if (!keyPair) {
      return String(
        <span style={{ color: "red" }}>
          Error: Accept offer got called before the keypair got initialized
        </span>,
      );
    }

    const answer: SimplePeer.SignalData | undefined = JSON.parse(
      await decrypt(keyPair, encryptedAnswer),
    );
    if (answer?.type !== "answer") {
      debugger;
      return String(
        <span style={{ color: "red" }}>
          Error: SignalData was not an answer.
        </span>,
      );
    }

    receiverAnswer = answer;

    log("acceptAnswer: peer?.signal");
    if (peer?.destroyed === false) {
      peer?.signal(answer);
    } else {
      const text = !getShouldBeSending()
        ? "Stopped by user. Click Start to continue sending."
        : "Peer was already destroyed when receiving answer. Recreating...";
      updateStatus(text);

      peer?.destroy();
      peer = null;

      updatePeer("sender");

      return "";
    }

    updateStatus("Answer obtained, establish direct connection...");

    return "";
  }

  async function initSender(customWait: CustomWait): Promise<string> {
    return String(
      <div>
        <h1>WebRTC Camera</h1>
        <div
          aria-busy="true"
          hx-get="js:app.senderConnectToWebcam"
          hx-target="this"
          hx-ext="serverless"
          hx-swap="outerHTML"
          hx-trigger="load"
        ></div>
      </div>,
    );
  }

  let videoDevices: MediaDeviceInfo[] = [];
  let peer: SimplePeer.Instance | null = null;

  function findCurrentMediaDeviceInfo() {
    const videoInputDeviceConfig = getConfig("videoInputDevice", [])[0];
    if (!videoInputDeviceConfig) return;

    const videoDevice = videoDevices.find(
      (x) =>
        x.kind === "videoinput" && x.label === videoInputDeviceConfig.label,
    );
    return videoDevice;
  }

  async function senderConnectToWebcam(customWait: CustomWait) {
    log("senderConnectToWebcam()");

    if (!keyPair) {
      keyPair = await loadKeyPairFromLocalStorage();
    }

    if (!keyPair) {
      keyPair = await generateKeyPair();
      storeKeyPairToLocalStorage(keyPair);
    }

    customWait(
      <>
        <div aria-busy="true">Checking permisson to the camera</div>
        <br />
        Please allow access, if not already done.
      </>,
    );

    /* get user's permission to muck around with video devices */
    const tempStream = await navigator.mediaDevices.getUserMedia({
      video: true,
    });
    const devices = await navigator.mediaDevices.enumerateDevices();
    customWait(String(<div aria-busy="true" />));

    videoDevices = devices.filter((x) => x.kind === "videoinput");
    const initialSelection = initialVideoDevice(videoDevices);

    const videoInputSelection: Children = [
      <details role="list">
        <summary
          aria-haspopup="listbox"
          id="videoInputSelection"
          data-index={initialSelection?.index}
          safe
        >
          {initialSelection?.label}
        </summary>
        <ul role="listbox">
          {videoDevices.map((device, index) => (
            <li>
              <a
                href="#"
                onclick={`${call("selectVideoDevice")}(${index});return true;`}
              >
                <span safe>{device.label}</span>
              </a>
            </li>
          ))}
        </ul>
      </details>,
    ];

    /* close the temp stream */
    const tracks = tempStream.getTracks();
    if (tracks) for (let t = 0; t < tracks.length; t++) tracks[t].stop();

    const initialVideoBitrate = getConfig("videoBitrate", 12);
    const videoBitrateSelection: Children = [
      // {/*style={{ paddingLeft: "0.5rem", paddingRight: "0.5rem" }}*/}
      <nav class="container">
        <ul>
          <button
            id="videoBitrateMinus"
            onclick={`${call("increaseVideoBitrate")}();return true;`}
            disabled={initialVideoBitrate <= minVideoBitrateValue}
          >
            <span class="square">-</span>
          </button>
        </ul>
        <ul>
          <span id="videoBitrateValue">{initialVideoBitrate}</span> MBit/s
        </ul>
        <ul>
          <button
            id="videoBitratePlus"
            onclick={`${call("decreaseVideoBitrate")}();return true;`}
            disabled={initialVideoBitrate >= maxVideoBitrateValue}
          >
            <span class="square">+</span>
          </button>
        </ul>
      </nav>,
    ];

    const videoSendActivation = getConfig("videoSendActivation", false);
    const videoSendActivationSelection: Children = [
      <nav>
        <ul>
          <li>Now sending to receiver?</li>
        </ul>
        <ul>
          <li>
            <a
              href="#"
              role="button"
              id="videoToggleSending"
              onclick={`${call("toggleSending")}();return true;`}
            >
              {videoSendActivation ? "Stop" : "Start"}
            </a>
          </li>
        </ul>
      </nav>,
    ];

    const connId = keyPair.publicKey.toString("hex");
    return String(
      <div
        class="sender-main"
        hx-ext="sse"
        sse-connect={`/connections/${connId}/sender-events`}
        hx-on={`htmx:load: ${call("updateStreamAndPreview", false)}()`}
      >
        <span>Video Input Device</span>
        {videoInputSelection}
        <span>Video Bitrate</span>
        {videoBitrateSelection}
        {videoSendActivationSelection}
        <div id="send-signal-container" />
        <a href={`/#key=${keyPair.secretKey.toString("hex")}`}>Share</a>
        <br />
        <div
          id="sender-connected"
          style={{ display: "none" }}
          sse-swap="connected"
        />
        <button
          id="restart-webcam"
          onclick={`${call("restartWebcam")}();return true;`}
        >
          Restart Webcam
        </button>
        <div id="video-preview-container" />
        <span id="status" />
        <div sse-swap="answer">
          <div aria-busy="true">
            {videoSendActivation
              ? "Waiting for receiver to provide an answer."
              : "Click Start to begin sending."}
          </div>
        </div>
        Receiver Count:{" "}
        <span sse-swap="receiver-count" hx-swap="innerHTML">
          0
        </span>
        <div class="log-header">Log</div>
        <div id="messages">{renderMessages(messages)}</div>
      </div>,
    );
  }

  async function restartWebcam(): Promise<void> {
    const stream = videoMediaStream?.mediaStream;
    if (stream) {
      if (peer?.destroyed === false) {
        peer?.removeStream(stream);
        const tracks = stream.getTracks();
        if (tracks) {
          for (let t = 0; t < tracks.length; t++) tracks[t].stop();
        }
      }
      videoMediaStream = null;
      updateStreamAndPreview();
      if (senderOffer) {
        sendSignalToWebserver(senderOffer);
      }
    }
  }

  function senderEventsConnected() {
    if (senderOffer) {
      sendSignalToWebserver(senderOffer);
    }
  }

  async function setPlayVideoMessage(
    video: HTMLVideoElement,
    message: string | undefined,
  ) {
    if (message === undefined) {
      const nextSibling = video.nextElementSibling;
      if (nextSibling) {
        nextSibling.remove();
        log("setPlayVideoMessage: Removed play message");
      }
    } else {
      var nextSibling = video.nextElementSibling as HTMLDivElement | null;
      if (!nextSibling) {
        video.insertAdjacentHTML(
          "afterend",
          String(
            <div class="video-message" safe>
              {message}
            </div>,
          ),
        );
        log("setPlayVideoMessage: Inserted play message");
      } else {
        nextSibling.innerText = message;
        log("setPlayVideoMessage: Updated play message");
      }
    }
  }

  async function playVideo(video: HTMLVideoElement) {
    try {
      await video.play();
      setPlayVideoMessage(video, undefined);
    } catch (err: unknown) {
      if (err instanceof DOMException) {
        if (err.name === "NotAllowedError") {
          const text = `Playback blocked by the browser, because the user didn't interacted
           with the document first. Click into the video element, to start
           playback.`;
          log(
            "playVideo: Playback blocked because user didn't interacted first.",
          );
          setPlayVideoMessage(video, text);

          return;
        }
      }
      console.error(err);
      debugger;
    }
  }

  function updateVideoDevicePreview(type: "sender" | "receiver") {
    if (disableVideo[type]) return;
    const videoPreviewContainer = document.getElementById(
      "video-preview-container",
    );
    if (!videoPreviewContainer) return;
    let video =
      videoPreviewContainer.firstElementChild as HTMLVideoElement | null;
    if (!video) {
      video = (function () {
        let video = document.createElement("video");
        video.width = 320;
        video.height = (320 * 9) / 16;
        video.muted = type === "sender";
        let recentlyClosedFullscreen = false;
        video.onclick = function (e) {
          try {
            e.stopPropagation();

            if (video.paused) {
              playVideo(video);
              return;
            }

            if (document.fullscreenElement === video) {
              document.exitFullscreen();
              recentlyClosedFullscreen = true;
              setTimeout(() => (recentlyClosedFullscreen = false), 150);
            } else {
              video.requestFullscreen();
            }
          } catch {}
        };
        if (type === "receiver") {
          video.onpause = function (e) {
            playVideo(video);
          };
        } else {
          video.onpause = function (e) {
            if (recentlyClosedFullscreen) playVideo(video);
          };
        }
        videoPreviewContainer.appendChild(video);
        return video;
      })();
    }

    if (!videoMediaStream) {
      video.pause();
      video.srcObject = null;
    } else {
      video.srcObject = videoMediaStream.mediaStream;
      playVideo(video);
    }
  }

  var messages: Array<string> = [];

  function renderMessages(messages: Array<string>): Children {
    return messages.slice(0, 50).map((item) => <span safe>{item}</span>);
  }

  function log(message: string) {
    console.log(message);
    var elMessages = document.getElementById("messages");

    messages.unshift(message);
    if (elMessages) {
      elMessages.innerHTML = String(<>{renderMessages(messages)}</>);
    }
  }

  async function receiverRequestOffer() {
    const sendOfferRequestContainer = document.getElementById(
      "send-offer-request-container",
    ) as HTMLDivElement | null;

    try {
      log("receiverRequestOffer()");

      // Send offer to the webserver so clients obtain and can answer it
      if (sendOfferRequestContainer) {
        if (!keyPair) {
          sendOfferRequestContainer.innerHTML = `Could not send offer request, because the keyPair is not initialized yet.`;
          sendOfferRequestContainer.style.color = "red";
          updateStatus("Requesting offer failed - KeyPair missing");
        } else if (!receiverId) {
          sendOfferRequestContainer.innerHTML = `Could not send offer request, because the receiverId is not initialized yet.`;
          sendOfferRequestContainer.style.color = "red";
          updateStatus("Requesting offer failed - ReceiverId missing");
        } else {
          // Encrypt signalData with keypair
          updateStatus("Sending offer request to the webserver");

          sendOfferRequestContainer.innerHTML = String(
            <>
              <form
                hx-post={`/connections/offer/request`}
                hx-target="this"
                hx-swap="outerHTML"
                hx-trigger="load"
                hx-include="[name='publicKey'],[name='connectionId']"
              >
                <input
                  type="hidden"
                  name="publicKey"
                  value={keyPair.publicKey.toString("hex")}
                />
                <input
                  type="hidden"
                  name="connectionId"
                  value={receiverId.toString()}
                />
              </form>
            </>,
          );

          const form = sendOfferRequestContainer.firstElementChild as
            | HTMLFormElement
            | undefined;
          if (form) {
            htmx.process(form);
          }
        }

        updateStatus("Requesting offer");
      }
    } catch (err: unknown) {
      if (sendOfferRequestContainer) {
        sendOfferRequestContainer.innerHTML = `Could not request offer, because of an unknown error.`;
        sendOfferRequestContainer.style.color = "red";
        log(
          `Could not request offer, because of an unknown error. Error: ${err}`,
        );
        updateStatus("Requesting offer failed - Unknown error");
        return;
      }
      console.log(err);
    }
  }

  async function sendSignalToWebserver(signalData: SimplePeer.SignalData) {
    if (signalData.type === "offer" && !getShouldBeSending()) return;

    const sendSignalContainer = document.getElementById(
      "send-signal-container",
    ) as HTMLDivElement | null;

    try {
      log("send key: " + signalData.type);

      // Send offer to the webserver so clients obtain and can answer it
      if (sendSignalContainer) {
        if (!keyPair) {
          sendSignalContainer.innerHTML = `Could not send ${signalData.type}, because the keyPair is not initialized yet.`;
          sendSignalContainer.style.color = "red";
        } else {
          // Encrypt signalData with keypair
          const encryptedSignalData = await encrypt(
            keyPair,
            JSON.stringify(signalData),
          );

          updateStatus(
            `Sending encrypted ${signalData.type} information to the webserver`,
          );

          sendSignalContainer.innerHTML = String(
            <>
              <form
                hx-post={`/connections/${signalData.type}`}
                hx-target="this"
                hx-swap="outerHTML"
                hx-trigger="load"
                hx-include="[name='publicKey'],[name='signalData']"
              >
                <input
                  type="hidden"
                  name="publicKey"
                  value={keyPair.publicKey.toString("hex")}
                />
                <input
                  type="hidden"
                  name="signalData"
                  value={encryptedSignalData}
                />
              </form>
            </>,
          );

          const form = sendSignalContainer.firstElementChild as
            | HTMLFormElement
            | undefined;
          if (form) {
            htmx.process(form);
          }
        }
      }
    } catch (err: unknown) {
      if (sendSignalContainer) {
        sendSignalContainer.innerHTML = `Could not send ${signalData.type}, because of an unknown error.`;
        sendSignalContainer.style.color = "red";
        return;
      }
      console.log(err);
    }
  }

  function sendSignalToWebserverFinished() {
    updateStatus(
      "Waiting for other client...\r\n\r\n\r\nIf it takes longer, try to share the link from the sender again.",
    );
    return "";
  }

  async function sendClearOfferToWebserver() {
    const sendSignalContainer = document.getElementById(
      "send-signal-container",
    ) as HTMLDivElement | null;

    try {
      log("clear key: offer");

      // Clear offer to the webserver so clients stop refreshing all the time
      if (sendSignalContainer) {
        if (!keyPair) {
          sendSignalContainer.innerHTML = `Could not clear offer, because the keyPair is not initialized yet.`;
          sendSignalContainer.style.color = "red";
        } else {
          updateStatus(`Clearing offer information from the webserver`);

          sendSignalContainer.innerHTML = String(
            <>
              <form
                hx-delete={`/connections/offer`}
                hx-target="this"
                hx-swap="outerHTML"
                hx-trigger="load"
                hx-include="[name='publicKey']"
              >
                <input
                  type="hidden"
                  name="publicKey"
                  value={keyPair.publicKey.toString("hex")}
                />
              </form>
            </>,
          );

          const form = sendSignalContainer.firstElementChild as
            | HTMLFormElement
            | undefined;
          if (form) {
            htmx.process(form);
          }
        }
      }
    } catch (err: unknown) {
      if (sendSignalContainer) {
        sendSignalContainer.innerHTML = `Could not clear offer, because of an unknown error.`;
        sendSignalContainer.style.color = "red";
        return;
      }
      console.log(err);
    }
  }

  function sendClearOfferFinished() {
    updateStatus("Stopped by user. Click Start to continue sending.");
    return "";
  }

  function updateStatus(text: string) {
    var statusEl = document.getElementById("status") as HTMLSpanElement | null;
    if (statusEl) {
      statusEl.innerText = text;
      if (text === "") {
        statusEl.removeAttribute("aria-busy");
      } else {
        statusEl.setAttribute("aria-busy", "true");
      }
      log(`updateStatus(): ${text}`);
    }
  }

  var senderPeerCounter = 0;

  function initSenderPeer() {
    log("initSenderPeer");

    const videoPeer = new SimplePeer({
      initiator: true,
      trickle: false,
      stream: videoMediaStream?.mediaStream ?? undefined,
      config: { iceServers: [] },
    });

    const senderPeerId = ++senderPeerCounter;

    videoPeer.on("signal", function (data) {
      if (videoPeer.destroyed) {
        log(
          `senderPeer(${senderPeerId}).signal: Ignore ${data.type} - already destroyed`,
        );
        return;
      }

      senderOffer = data;
      log(`senderPeer(${senderPeerId}).signal: ${data.type}`);

      sendSignalToWebserver(data);
    });

    videoPeer.on("connect", function () {
      log(`senderPeer(${senderPeerId}).connected`);
      updateStatus("");
    });

    videoPeer.on("stream", function (stream) {
      log(`senderPeer(${senderPeerId}).stream: ${stream}`);
    });

    videoPeer.on("close", function () {
      log(`senderPeer(${senderPeerId}).close`);
      updateStatus("Disconnected");
    });

    videoPeer.on("error", function (err) {
      log(`senderPeer(${senderPeerId}).error: ${err}`);
      updateStatus("Error");
    });

    return videoPeer;
  }

  function getShouldBeSending() {
    return getConfig("videoSendActivation", false);
  }

  function initReceiverPeer() {
    log("initReceiverPeer");

    const videoPeer = new SimplePeer({
      initiator: false,
      trickle: false,
      config: { iceServers: [] },
    });

    videoPeer.on("signal", function (data) {
      log(`receiverPeer.signal: ${data.type}`);
      senderOffer = data;
      sendSignalToWebserver(data);

      setTimeout(() => {
        if (videoPeer.destroyed) {
          // This is probably already reconnected with a new peer.
          // So ignore this timeout event.
          return;
        }

        if (!videoPeer.connected) {
          videoPeer.destroy();
          videoMediaStream = null;
          receiverRequestOffer();
        }
      }, 10000);
    });

    videoPeer.on("connect", function () {
      updateVideoDevicePreview("receiver");

      log(`receiverPeer.connected`);

      updateStatus("");
    });

    videoPeer.on("stream", function (stream) {
      // Play received stream.
      videoMediaStream = { mediaStream: stream };

      log(`receiverPeer.stream: ${stream}`);
    });

    videoPeer.on("close", () => {
      videoMediaStream = null;

      // updateVideoDevicePreview("receiver");

      log(`receiverPeer.close`);

      if (!videoPeer.destroyed || peer === videoPeer || !peer) {
        updateStatus("Disconnected.");

        const maxSteps = 10;
        let remainingSteps = maxSteps;

        const countdownInterval = setInterval(function () {
          if (--remainingSteps <= 0 || (peer && videoPeer !== peer)) {
            clearInterval(countdownInterval);
            return;
          }

          if (!videoPeer.connected) {
            updateStatus(
              `Disconnected. Try reconnecting in ${remainingSteps} seconds...`,
            );
          }
        }, 1000);

        setTimeout(() => {
          if (peer && videoPeer !== peer) {
            // This is probably already reconnected with a new peer.
            // So ignore this timeout event.
            clearInterval(countdownInterval);
            return;
          }

          if (!videoPeer.connected) {
            videoPeer.destroy();
            videoMediaStream = null;
            receiverRequestOffer();
            clearInterval(countdownInterval);
          }
        }, maxSteps * 1000);
      }
    });

    videoPeer.on("error", function (err) {
      log(`receiverPeer.error: ${err}`);

      if (!videoPeer.destroyed) {
        updateStatus("Error");
      }
    });

    return videoPeer;
  }

  function updatePeer(type: "sender" | "receiver") {
    log(`updatePeer(${type})`);
    if (type === "sender") {
      const shouldBeSending = getShouldBeSending();
      if (!shouldBeSending) {
        if (peer) {
          peer.destroy();
          peer = null;
        }
        return;
      }

      peer = peer?.destroyed === false ? peer : initSenderPeer();

      let streamAlreadyAdded = false;
      const streams = peer.streams;

      for (const stream of peer.streams) {
        if (shouldBeSending && stream === videoMediaStream?.mediaStream) {
          streamAlreadyAdded = true;
          continue;
        }
        peer.removeStream(stream);

        const index = streams.indexOf(stream);
        if (index > -1) {
          // only splice array when item is found
          streams.splice(index, 1); // 2nd parameter means remove one item only
        }

        const tracks = stream.getTracks();
        for (const track of tracks) {
          track.stop();
        }
      }

      log(
        `updatePeer(${type}): { videoMediaStream: ${videoMediaStream?.mediaStream?.id}, streamAlreadyAdded: ${streamAlreadyAdded} }`,
      );

      if (videoMediaStream && !streamAlreadyAdded) {
        peer.addStream(videoMediaStream.mediaStream);
        streams.push(videoMediaStream.mediaStream);
      }

      const _pc = getSimplePeerPc(peer);
      if (_pc) {
        for (const sender of _pc.getSenders()) {
          const track = sender.track;
          if (!track || track.kind !== "video") continue;

          const parameters = sender.getParameters();
          if (!parameters.encodings) {
            parameters.encodings = [{}];
          }

          const maxBitrateInBitsPerSecond =
            getConfig("videoBitrate", 12) * 1000 * 1000;
          if (
            parameters.encodings[0].maxBitrate !== maxBitrateInBitsPerSecond
          ) {
            parameters.encodings[0].maxBitrate = maxBitrateInBitsPerSecond;
            sender
              .setParameters(parameters)
              .then(() => {
                log(
                  `Bitrate changed successfuly to ${maxBitrateInBitsPerSecond}`,
                );
              })
              .catch((e: unknown) => console.error(e));
          }
        }
      }
    } else if (type === "receiver") {
      peer = peer?.destroyed === false ? peer : initReceiverPeer();

      if (senderOffer) {
        peer.signal(senderOffer);
      }
    }
  }

  let updateStreamAndPreviewPromise: Promise<void> | null = null;

  function updateStreamAndPreview() {
    updateStreamAndPreviewPromise =
      updateStreamAndPreviewPromise ??
      (async function () {
        try {
          log("updateStreamAndPreview");
          const deviceInfo = findCurrentMediaDeviceInfo();

          const oldId = videoMediaStream?.mediaStream.id;

          videoMediaStream =
            (deviceInfo && (await getMediaStream(deviceInfo))) ?? null;

          log(
            `updateStreamAndPreview: ${oldId} -> ${videoMediaStream?.mediaStream.id}`,
          );

          updateVideoDevicePreview("sender");

          updatePeer("sender");
        } catch (e) {
          console.error("updateStreamAndPreview failed", e);
        } finally {
          updateStreamAndPreviewPromise = null;
        }
      })();
  }

  function selectVideoDevice(index: number) {
    const videoInputSelection = document.getElementById("videoInputSelection");
    if (videoInputSelection) {
      videoInputSelection.dataset.index = `${index}`;
      videoInputSelection.innerText = videoDevices[index]?.label ?? "";

      if (changeVideoDevice(videoDevices[index] ?? undefined)) {
        updateStreamAndPreview();
      }
    }
  }

  function changeVideoBitrate(delta: number) {
    const videoBitrateMinus = document.getElementById(
      "videoBitrateMinus",
    ) as HTMLButtonElement | null;
    const videoBitrateValue = document.getElementById(
      "videoBitrateValue",
    ) as HTMLSpanElement | null;
    const videoBitratePlus = document.getElementById(
      "videoBitratePlus",
    ) as HTMLButtonElement | null;
    if (videoBitrateMinus && videoBitrateValue && videoBitratePlus) {
      const currentValue = parseFloat(videoBitrateValue.innerText);
      const newValue = Math.min(
        maxVideoBitrateValue,
        Math.max(minVideoBitrateValue, currentValue + delta),
      );
      videoBitrateValue.innerText = `${newValue}`;
      videoBitrateMinus.disabled = newValue <= minVideoBitrateValue;
      videoBitratePlus.disabled = newValue >= maxVideoBitrateValue;
      setConfig("videoBitrate", newValue);

      updatePeer("sender");
    }
  }

  function increaseVideoBitrate() {
    changeVideoBitrate(-1);
  }
  function decreaseVideoBitrate() {
    changeVideoBitrate(1);
  }

  function toggleSending() {
    const videoToggleSending = document.getElementById(
      "videoToggleSending",
    ) as HTMLButtonElement | null;
    if (videoToggleSending) {
      const value = !getConfig("videoSendActivation", false);
      videoToggleSending.innerText = value ? "Stop" : "Start";
      setConfig("videoSendActivation", value);

      updateStreamAndPreview();

      if (!value) {
        sendClearOfferToWebserver();
      }
    }
  }

  window.onhashchange = async function () {
    const container = document.querySelector("main.container");
    if (!container) return;

    container.innerHTML = String(<AppInitializer />);
    var appInitializer = container.firstElementChild as HTMLElement;
    if (!appInitializer) return;

    htmx.process(appInitializer);
  };

  return {
    call: call,
    init: syncify(async (customWait: CustomWait) => {
      return (await initReceiver()) ?? (await initSender(customWait));
    }),
    senderConnectToWebcam: syncify(senderConnectToWebcam),
    restartWebcam: restartWebcam,
    senderEventsConnected: senderEventsConnected,
    selectVideoDevice: selectVideoDevice,
    increaseVideoBitrate: increaseVideoBitrate,
    decreaseVideoBitrate: decreaseVideoBitrate,
    toggleSending: toggleSending,
    updateStreamAndPreview: updateStreamAndPreview,
    sendSignalToWebserverFinished: sendSignalToWebserverFinished,
    sendClearOfferToWebserver: sendClearOfferToWebserver,
    sendClearOfferFinished: sendClearOfferFinished,
    acceptReceiverId: syncify(
      (customWait: CustomWait, data: [unknown, { id: number }]) => {
        return acceptReceiverId(data[1].id);
      },
    ),
    acceptOffer: syncify(
      (customWait: CustomWait, data: [unknown, { offer: string }]) => {
        return acceptOffer(data[1].offer);
      },
    ),
    acceptAnswer: syncify(
      (customWait: CustomWait, data: [unknown, { answer: string }]) => {
        return acceptAnswer(data[1].answer);
      },
    ),
    addDiv: () => (
      <div>
        Inserted by <span safe>{call("addDiv")}</span>
      </div>
    ),
  };
};
