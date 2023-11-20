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
  generateKeyPair,
  loadKeyPairFromLocalStorage,
  reconstructKeyPairFromSecret,
  storeKeyPairToLocalStorage,
} from "../types/KeyPair";

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

    // TODO: If we have a secret key, we must construct
    // the public key, fetch the offer and answer it.
    return String(
      <div>TODO: Here should have been the code for the receiver!</div>,
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
  var videoMediaStream: MediaStream | null = null;

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

    return String(
      <div
        hx-ext="sse"
        sse-connect={`/connections/sender-events/${keyPair.publicKey.toString(
          "hex",
        )}`}
        hx-on={`htmx:load: ${call("updateStreamAndPreview", false)}()`}
      >
        <span>Video Input Device</span>
        {videoInputSelection}
        <span>Video Bitrate</span>
        {videoBitrateSelection}
        <span safe>PublicKey: {keyPair.publicKey.toString("hex")}</span>
        <br />
        <span safe> SecretKey: {keyPair.secretKey.toString("hex")}</span>
        <br />
        <a href={`/#key=${keyPair.secretKey.toString("hex")}`}>Share</a>
        <br />
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

  function updateStreamAndPreview() {
    (async function () {
      try {
        console.log("hx-on - afterSettle");
        const deviceInfo = findCurrentMediaDeviceInfo();
        videoMediaStream =
          (deviceInfo && (await getMediaStream(deviceInfo))) ?? null;
        updateVideoDevicePreview();
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
    selectVideoDevice: selectVideoDevice,
    increaseVideoBitrate: increaseVideoBitrate,
    decreaseVideoBitrate: decreaseVideoBitrate,
    updateStreamAndPreview: updateStreamAndPreview,
    addDiv: () => (
      <div>
        Inserted by <span safe>{call("addDiv")}</span>
      </div>
    ),
  };
};
