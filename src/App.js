import { useRef, useEffect } from "react";
import "./App.css";
import io from "socket.io-client";
import * as mediasoupClient from "mediasoup-client";

function App() {
  const consumerVideo = useRef();
  const localVideo = useRef();
  const SOCKET_IO_URL = "http://localhost:3001";
  const socket = io();
  let device;
  let params = {
    encoding: [
      {
        rid: "r0",
        maxBitrate: 100000,
        scalabilityMode: "S1T3",
      },
      {
        rid: "r1",
        maxBitrate: 300000,
        scalabilityMode: "S1T3",
      },
      {
        rid: "r2",
        maxBitrate: 900000,
        scalabilityMode: "S1T3",
      },
    ],
    codecOptions: {
      videoGoogleStartBitrate: 1000,
    },
  };
  let rtpCapabilities;
  let producerTransport;
  let consumerTransport;
  let producer;
  let consumer;
  let isProducer = false;

  useEffect(() => {
    socket.on("connection_success", ({ socketId, existsProducer }) => {
      console.log(socketId, existsProducer);
    });
  }, [socket]);

  const getLocalVideo = () => {
    navigator.mediaDevices
      .getUserMedia({
        audio: true,
        video: true,
      })
      .then(streamSuccess)
      .catch((error) => {
        console.log(error);
      });
  };

  const streamSuccess = (stream) => {
    localVideo.current.srcObject = stream;
    localVideo.current.volume = 0;
    const track = stream.getVideoTracks()[0];

    // const track = {
    //   audioTrack: stream.getAudioTracks()[0],
    //   videoTrack: stream.getVideoTracks()[0],
    // };

    params = {
      track,
      ...params,
    };

    goConnect(true);
  };

  const goConsume = () => {
    goConnect(false);
  };

  const goConnect = (producerOrConsumer) => {
    isProducer = producerOrConsumer;
    device === undefined ? getRtpCapabilities() : goCreateTransport();
  };

  const goCreateTransport = () => {
    isProducer ? createSendTransport() : createReceiveTransport();
  };

  const createDevice = async () => {
    try {
      device = new mediasoupClient.Device();
      // console.log(device);
      await device.load({
        routerRtpCapabilities: rtpCapabilities,
      });
      console.log(" Device RTPcapabilities", rtpCapabilities);

      goCreateTransport();
    } catch (error) {
      console.log(error);
    }
  };

  const getRtpCapabilities = () => {
    socket.emit("createRoom", (data) => {
      console.log(`Router rtp capabilities ${data.rtpCapabilities}`);

      rtpCapabilities = data.rtpCapabilities;
      createDevice();
    });
  };

  const createSendTransport = async () => {
    socket.emit("createSendTransport", { sender: true }, ({ params }) => {
      if (params.error) {
        console.log(params.error);
        return;
      }
      console.log(params);

      producerTransport = device.createSendTransport(params);

      producerTransport.on(
        "connect",
        async ({ dtlsParameters }, callback, errback) => {
          try {
            await socket.emit("transport-connect", {
              // transportId: producerTransport.id,
              dtlsParameters: dtlsParameters,
            });

            callback();
          } catch (error) {
            errback(error);
          }
        }
      );

      producerTransport.on("produce", async (parameters, callback, errback) => {
        console.log(parameters);
        try {
          await socket.emit(
            "transport-produce",
            {
              transportId: producerTransport.id,
              kind: parameters.kind,
              rtpParameters: parameters.rtpParameters,
              appData: parameters.appData,
            },
            ({ id }) => {
              callback({ id });
            }
          );
        } catch (error) {
          errback(error);
        }
      });
      connectSendTransport();
    });
  };

  const connectSendTransport = async () => {
    producer = await producerTransport.produce(params);

    producer.on("trackended", () => {
      console.log("track ended");
    });

    producer.on("transportclose", () => {
      console.log("transport ended");
    });
  };

  const createReceiveTransport = async () => {
    await socket.emit(
      "createSendTransport",
      { sender: false },
      ({ params }) => {
        if (params.error) {
          console.log(params.error);
          return;
        }

        console.log(params);

        consumerTransport = device.createRecvTransport(params);

        consumerTransport.on(
          "connect",
          async ({ dtlsParameters }, callback, errback) => {
            try {
              await socket.emit("transport-recv-connect", {
                // transportId: consumerTransport.id,
                dtlsParameters,
              });

              callback();
            } catch (error) {
              errback(error);
            }
          }
        );
      }
    );

    connectReceiveTransport();
  };

  const connectReceiveTransport = async () => {
    await socket.emit(
      "consume",
      {
        rtpCapabilities: device.rtpCapabilities,
      },
      async ({ params }) => {
        if (params.error) {
          console.log("Cannot consume");
          return;
        }
        consumer = await consumerTransport.consume({
          id: params.id,
          producerId: params.producerId,
          kind: params.kind,
          rtpParameters: params.rtpParameters,
        });

        const { track } = consumer;
        console.log("consumer", consumer);
        consumerVideo.current.srcObject = new MediaStream([track]);

        socket.emit("consumer-resume");
      }
    );
  };

  return (
    <div className="App">
      <video
        ref={localVideo}
        // controls
        autoPlay
        style={{
          width: "240px",
          height: "180px",
          border: "1px solid black",
        }}
      ></video>
      <video
        ref={consumerVideo}
        autoPlay
        style={{
          width: "240px",
          height: "180px",
          border: "1px solid black",
        }}
      ></video>
      <div>
        <button onClick={getLocalVideo}>Publish</button>
        {/* <button onClick={getRtpCapabilities}>Get RTP capabilities</button>
        <button onClick={createDevice}>Create device</button>
        <button onClick={createSendTransport}>Create send transport</button>
        <button onClick={connectSendTransport}>
          Create send transport & produce
        </button> */}
        <button onClick={goConsume}>Consume</button>
        {/* <button onClick={connectReceiveTransport}>
          Create receive transport & consume
        </button> */}
      </div>
    </div>
  );
}

export default App;