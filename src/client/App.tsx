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
  encrypt,
  generateKeyPair,
  loadKeyPairFromLocalStorage,
  reconstructKeyPairFromSecret,
  storeKeyPairToLocalStorage,
} from "../types/KeyPair";
import SimplePeer from "simple-peer";

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

function getMediaStream(videoDevice: MediaDeviceInfo | null) {
  if (!videoDevice) return null;

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
  const stream = navigator.mediaDevices.getUserMedia(constraints);
  return stream;
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

    keyPair = await reconstructKeyPairFromSecret(
      X25519SecretKey.from(secretKeyText, "hex"),
    );

    const connId = keyPair.publicKey.toString("hex");
    // TODO: If we have a secret key, we must construct
    // the public key, fetch the offer and answer it.
    return String(
      <div hx-ext="sse" sse-connect={`/connections/${connId}/receiver-events`}>
        <div sse-swap="offer">
          <div aria-busy="true" />
        </div>
      </div>,
    );
  }

  async function acceptOffer(encryptedOffer: string): Promise<string> {
    // TODO: Do not print the encryptedOffer. 
    // Instead decrypt it answer it and send it encrypted back to the server,
    // so the sender can receive the answer.
    return String(
      <div>
        Offer accepted
        <br />
        <span safe>{encryptedOffer}</span>
      </div>,
    );
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
  let videoMediaStream: MediaStream | null = null;
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

    const connId = keyPair.publicKey.toString("hex");
    return String(
      <div
        hx-ext="sse"
        sse-connect={`/connections/${connId}/sender-events`}
        hx-on={`htmx:load: ${call("updateStreamAndPreview", false)}()`}
      >
        <span>Video Input Device</span>
        {videoInputSelection}
        <span>Video Bitrate</span>
        {videoBitrateSelection}
        <div id="send-signal-container" />
        <span safe>PublicKey: {keyPair.publicKey.toString("hex")}</span>
        <br />
        <span safe> SecretKey: {keyPair.secretKey.toString("hex")}</span>
        <br />
        <a href={`/#key=${keyPair.secretKey.toString("hex")}`}>Share</a>
        <br />
        <div
          id="sender-connected"
          style={{ display: "none" }}
          sse-swap="connected"
        />
        <div id="video-preview-container" />
        <br />
        Receiver Count: <span sse-swap="receiver-count">?</span>
        <br />
        <Button hx-get="/connections" hx-target="this" hx-swap="outerHTML">
          From Server
        </Button>
        <Button
          hx-get={call("addDiv")}
          hx-target="this"
          hx-ext="serverless"
          hx-swap="outerHTML"
        >
          From Client
        </Button>
        Some text below buttons
      </div>,
    );
  }

  let senderSignalData: SimplePeer.SignalData | undefined;

  function senderEventsConnected() {
    if (senderSignalData) {
      sendSignalToWebserver(senderSignalData);
    }
  }

  function updateVideoDevicePreview() {
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
        video.muted = true;
        video.onclick = function () {
          try {
            if (document.fullscreenElement === video) {
              document.exitFullscreen();
            } else {
              video.requestFullscreen();
            }
          } catch {}
        };
        videoPreviewContainer.appendChild(video);
        return video;
      })();
    }

    video.srcObject = videoMediaStream;
    video.play();
  }

  async function sendSignalToWebserver(signalData: SimplePeer.SignalData) {
    const sendSignalContainer = document.getElementById(
      "send-signal-container",
    ) as HTMLDivElement | null;

    try {
      console.log("send key: " + signalData.type);

      // Send offer to the webserver so clients obtain and can answer it
      if (sendSignalContainer) {
        if (!keyPair) {
          sendSignalContainer.innerHTML = `Could not send ${signalData.type}, because the keyPair is not initialized yet.`;
          sendSignalContainer.style.color = "red";
        } else {
          // TODO: Encrypt signalData with keypair
          const encryptedSignalData = await encrypt(
            keyPair,
            JSON.stringify(signalData),
          );

          sendSignalContainer.innerHTML = String(
            <>
              <form
                aria-busy="true"
                hx-post="/connections/offer"
                hx-target="this"
                hx-swap="outerHTML"
                hx-trigger="load"
                hx-include="[name='publicKey'],[name='signalData']"
              >
                <span>
                  Sending encrypted offer information to the webserver
                </span>
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

  function initSenderPeer() {
    const videoPeer = new SimplePeer({
      initiator: true,
      trickle: false,
      stream: videoMediaStream ?? undefined,
      config: { iceServers: [] },
    });

    videoPeer.on("signal", function (data) {
      senderSignalData = data;
      sendSignalToWebserver(data);
    });

    return videoPeer;
  }

  function updatePeer(type: "sender" | "receiver") {
    if (type === "sender") {
      peer = peer ?? initSenderPeer();

      let streamAlreadyAdded = false;
      for (const stream of peer.streams) {
        if (stream === videoMediaStream) {
          streamAlreadyAdded = true;
          continue;
        }
        peer.removeStream(stream);
        const tracks = stream.getTracks();
        for (const track of tracks) {
          track.stop();
        }
      }

      if (videoMediaStream && !streamAlreadyAdded) {
        peer.addStream(videoMediaStream);
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
                console.log(
                  `Bitrate changed successfuly to ${maxBitrateInBitsPerSecond}`,
                );
              })
              .catch((e: unknown) => console.error(e));
          }
        }
      }
    }
  }

  function updateStreamAndPreview() {
    (async function () {
      try {
        //console.log("hx-on - afterSettle");
        const deviceInfo = findCurrentMediaDeviceInfo();
        videoMediaStream =
          (deviceInfo && (await getMediaStream(deviceInfo))) ?? null;
        updateVideoDevicePreview();

        updatePeer("sender");
      } catch (e) {
        console.error("updateStreamAndPreview failed", e);
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

  return {
    call: call,
    init: syncify(async (customWait: CustomWait) => {
      return (await initReceiver()) ?? (await initSender(customWait));
    }),
    senderConnectToWebcam: syncify(senderConnectToWebcam),
    senderEventsConnected: senderEventsConnected,
    selectVideoDevice: selectVideoDevice,
    increaseVideoBitrate: increaseVideoBitrate,
    decreaseVideoBitrate: decreaseVideoBitrate,
    updateStreamAndPreview: updateStreamAndPreview,
    acceptOffer: syncify((customWait: CustomWait, data: [unknown, {offer: string}]) => {
      return acceptOffer(data[1].offer);
    }),
    addDiv: () => (
      <div>
        Inserted by <span safe>{call("addDiv")}</span>
      </div>
    ),
  };
};
