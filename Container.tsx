/* eslint-disable react/no-unstable-nested-components */
/* eslint-disable react-native/no-inline-styles */
// https://dev.to/video-sdk/react-native-webrtc-lm9
import React, {useRef, useState, useEffect} from 'react';
import Config from 'react-native-config';
import {
  View,
  Text,
  TouchableOpacity,
  Button,
  TextInput,
  Linking,
} from 'react-native';
import SocketIOClient from 'socket.io-client';
import {
  mediaDevices,
  RTCPeerConnection,
  RTCView,
  RTCIceCandidate,
  RTCSessionDescription,
} from 'react-native-webrtc';

const Container = () => {
  const [type, setType] = useState('JOIN');

  const [callerId] = useState(
    Math.floor(100000 + Math.random() * 900000).toString(),
  );

  let otherUserId = useRef(null);

  // Stream of local user
  const [localStream, setlocalStream] = useState(null);

  /* When a call is connected */
  const [remoteStream, setRemoteStream] = useState(null);

  // establishes WebSocket connection
  const socket = SocketIOClient(Config.SOCKET_URL, {
    transports: ['websocket'],
    query: {callerId},
  });

  /* This creates an WebRTC Peer Connection,
  which will be used to set local/remote descriptions and offers. */
  const peerConnection = useRef(
    new RTCPeerConnection({
      iceServers: [
        {urls: 'stun:stun.l.google.com:19302'},
        {urls: 'stun:stun1.l.google.com:19302'},
        {urls: 'stun:stun2.l.google.com:19302'},
      ],
    }),
  );

  useEffect(() => {
    // socket.on('newCall', data => {
    //   /* This event occurs whenever any peer wishes to establish a call with you. */
    //   console.log('newCall', data);
    // });

    // socket.on('callAnswered', data => {
    //   /* This event occurs whenever remote peer accept the call. */
    //   console.log('callAnswered', data);
    // });

    // socket.on('ICEcandidate', data => {
    //   /* This event is for exchangin Candidates. */
    //   console.log('ICEcandidate', data);
    // });

    let isFront = false;

    /*The MediaDevices interface allows you to access connected media inputs
    such as cameras and microphones.
    We ask the user for permission to access those media inputs
    by invoking the mediaDevices.getUserMedia() method. */
    console.log('4444444444 MEDIA DEVICES', mediaDevices);
    mediaDevices.enumerateDevices().then(sourceInfos => {
      let videoSourceId;
      for (let i = 0; i < sourceInfos.length; i++) {
        const sourceInfo = sourceInfos[i];
        if (
          sourceInfo.kind == 'videoinput' &&
          sourceInfo.facing == (isFront ? 'user' : 'environment')
        ) {
          videoSourceId = sourceInfo.deviceId;
        }
      }

      mediaDevices
        .getUserMedia({
          audio: true,
          video: {
            mandatory: {
              minWidth: 300,
              minHeight: 300,
              minFrameRate: 30,
            },
            facingMode: isFront ? 'user' : 'environment',
            optional: videoSourceId ? [{sourceId: videoSourceId}] : [],
          },
        })
        .then(stream => {
          // console.error(111111111111, '----STREAM', stream, '------');
          setlocalStream(stream); // Get local stream
          for (const track of stream.getTracks()) {
            peerConnection.current.addTrack(track, stream);
          }
          // peerConnection.current.addStream(stream); // setup stream listening
        })
        .catch(error => {
          console.error('getUserMedia ERROR!!!!', error);
        });
    });

    // peerConnection.current.onaddstream = event => {
    //   console.log('55555555555555555555----SET_REMOTE_STREAM', event.stream, '------');
    //   setRemoteStream(event.stream);
    // };

    peerConnection.current.ontrack = ({streams: [stream]}) => {
      console.error(333333333333333, 'REMOTE_STREAM', stream);
      // (videoElem.srcObject = stream);
      setRemoteStream(stream);
    };

    // peerConnection.current.onicecandidate = event => {
    //   // Setup ice handling
    // };

    return () => {
      socket.off('newCall');
      socket.off('callAnswered');
      socket.off('ICEcandidate');
    };
  }, []);

  let remoteRTCMessage = useRef(null);

  useEffect(() => {
    socket.on('newCall', data => {
      remoteRTCMessage.current = data.rtcMessage;
      otherUserId.current = data.callerId;
      setType('INCOMING_CALL');
    });

    socket.on('callAnswered', data => {
      // 7. When Alice gets Bob's session description, she sets that as the remote description with `setRemoteDescription` method.
      remoteRTCMessage.current = data.rtcMessage;
      peerConnection.current.setRemoteDescription(
        new RTCSessionDescription(remoteRTCMessage.current),
      );
      setType('WEBRTC_ROOM');
    });

    socket.on('ICEcandidate', data => {
      let message = data.rtcMessage;

      // When Bob gets a candidate message from Alice,
      // he calls `addIceCandidate` to add the candidate to the remote peer description.
      if (peerConnection.current) {
        peerConnection?.current
          .addIceCandidate(new RTCIceCandidate(message.candidate))
          .then(data => {
            console.log('--------------SUCCESS------------', data);
          })
          .catch(err => {
            console.log('--------Error--------', err);
          });
      }
    });

    // Alice creates an RTCPeerConnection object with an `onicecandidate` handler,
    // which runs when network candidates become available.
    peerConnection.current.onicecandidate = event => {
      if (event.candidate) {
        console.error(222222222222, event.candidate);
        // Alice sends serialized candidate data to Bob using Socket
        sendICEcandidate({
          calleeId: otherUserId.current,
          rtcMessage: {
            label: event.candidate.sdpMLineIndex,
            id: event.candidate.sdpMid,
            candidate: event.candidate.candidate,
          },
        });
      } else {
        console.log('End of candidates.');
      }
    };
  }, []);

  function sendICEcandidate(data) {
    socket.emit('ICEcandidate', data);
  }

  async function processCall() {
    // 1. Alice runs the `createOffer` method for getting SDP.
    const sessionDescription = await peerConnection.current.createOffer();

    // 2. Alice sets the local description using `setLocalDescription`.
    await peerConnection.current.setLocalDescription(sessionDescription);

    // 3. Send this session description to Bob uisng socket
    sendCall({
      calleeId: otherUserId.current,
      rtcMessage: sessionDescription,
    });
  }

  async function processAccept() {
    // 4. Bob sets the description, Alice sent him as the remote description using `setRemoteDescription()`
    peerConnection.current.setRemoteDescription(
      new RTCSessionDescription(remoteRTCMessage.current),
    );

    // 5. Bob runs the `createAnswer` method
    const sessionDescription = await peerConnection.current.createAnswer();

    // 6. Bob sets that as the local description and sends it to Alice
    await peerConnection.current.setLocalDescription(sessionDescription);
    answerCall({
      callerId: otherUserId.current,
      rtcMessage: sessionDescription,
    });
  }

  function answerCall(data) {
    socket.emit('answerCall', data);
  }

  function sendCall(data) {
    socket.emit('call', data);
  }

  // Destroy WebRTC Connection
  function leave() {
    peerConnection.current.close();
    setlocalStream(null);
    setType('JOIN');
  }

  const [localMicOn, setlocalMicOn] = useState(true);
  const [localWebcamOn, setlocalWebcamOn] = useState(true);

  function switchCamera() {
    localStream.getVideoTracks().forEach(track => {
      track._switchCamera();
    });
  }

  function toggleCamera() {
    console.log('---------localStream', localStream);
    localWebcamOn ? setlocalWebcamOn(false) : setlocalWebcamOn(true);
    localStream.getVideoTracks().forEach(track => {
      localWebcamOn ? (track.enabled = false) : (track.enabled = true);
    });
  }

  function toggleMic() {
    localMicOn ? setlocalMicOn(false) : setlocalMicOn(true);
    localStream.getAudioTracks().forEach(track => {
      localMicOn ? (track.enabled = false) : (track.enabled = true);
    });
  }

  const initiateWhatsApp = () => {
    const whatsAppMsg = 'hello its a message from RN App';
    const mobileNumber = '375293673546';
    let url = 'whatsapp://send?text=' + whatsAppMsg + '&phone=' + mobileNumber;

    Linking.openURL(url)
      .then(data => {
        console.log('WhatsApp Opened', data);
      })
      .catch(() => {
        console.log('Make sure Whatsapp installed on your device');
      });
  };

  const JoinScreen = () => {
    return (
      <View
        style={{
          height: '100%',
          width: '100%',
          backgroundColor: 'pink',
          justifyContent: 'center',
          paddingHorizontal: 42,
        }}>
        <View
          style={{
            height: 120,
            padding: 35,
            backgroundColor: '#1A1C22',
            justifyContent: 'center',
            alignItems: 'center',
            borderRadius: 14,
          }}>
          <Text
            style={{
              fontSize: 18,
              color: '#D0D4DD',
            }}>
            Your Caller ID
          </Text>
          <View
            style={{
              flexDirection: 'row',
              marginTop: 12,
              alignItems: 'center',
            }}>
            <Text
              style={{
                fontSize: 32,
                color: '#ffff',
                letterSpacing: 6,
              }}>
              {callerId}
            </Text>
          </View>
        </View>
        <View
          style={{
            height: 190,
            backgroundColor: '#1A1C22',
            padding: 40,
            marginTop: 25,
            justifyContent: 'center',
            borderRadius: 14,
          }}>
          <Text
            style={{
              fontSize: 18,
              color: '#D0D4DD',
            }}>
            Call id of another user
          </Text>
          <TextInput
            style={{
              margin: 8,
              padding: 8,
              width: '90%',
              textAlign: 'center',
              fontSize: 16,
              color: '#FFFFFF',
            }}
            multiline={true}
            numberOfLines={1}
            cursorColor={'#5568FE'}
            placeholderTextColor={'#9A9FA5'}
            onChangeText={text => {
              otherUserId.current = text;
            }}
            placeholder={'Enter Caller ID'}
            value={otherUserId.current}
            keyboardType={'number-pad'}
          />

          <TouchableOpacity
            onPress={() => {
              processCall();
              setType('OUTGOING_CALL');
            }}
            style={{
              height: 50,
              backgroundColor: '#5568FE',
              justifyContent: 'center',
              alignItems: 'center',
              borderRadius: 12,
              marginTop: 16,
            }}>
            <Text
              style={{
                fontSize: 16,
                color: '#FFFFFF',
              }}>
              Call Now
            </Text>
          </TouchableOpacity>
        </View>
        <View>
          <TouchableOpacity
            activeOpacity={0.7}
            style={{
              justifyContent: 'center',
              marginTop: 15,
              padding: 10,
              backgroundColor: '#8ad24e',
            }}
            onPress={initiateWhatsApp}>
            <Text style={{color: '#fff', textAlign: 'center'}}>
              Send WhatsApp Message
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const OutgoingCallScreen = () => {
    return (
      <View
        style={{
          height: '100%',
          justifyContent: 'space-around',
          backgroundColor: '#050A0E',
        }}>
        <View
          style={{
            padding: 35,
            justifyContent: 'center',
            alignItems: 'center',
            borderRadius: 14,
          }}>
          <Text
            style={{
              fontSize: 16,
              color: '#D0D4DD',
            }}>
            Calling to...
          </Text>

          <Text
            style={{
              fontSize: 36,
              marginTop: 12,
              color: '#ffff',
              letterSpacing: 6,
            }}>
            {otherUserId.current}
          </Text>
        </View>
        <View
          style={{
            justifyContent: 'center',
            alignItems: 'center',
          }}>
          <TouchableOpacity
            onPress={() => {
              setType('JOIN');
              otherUserId.current = null;
            }}
            style={{
              backgroundColor: '#FF5D5D',
              borderRadius: 30,
              height: 60,
              aspectRatio: 1,
              justifyContent: 'center',
              alignItems: 'center',
            }}>
            <Text style={{color: '#fff'}}>Call End</Text>
            {/* <CallEnd width={50} height={12} /> */}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const IncomingCallScreen = () => {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'space-around',
          backgroundColor: '#050A0E',
        }}>
        <View
          style={{
            padding: 35,
            justifyContent: 'center',
            alignItems: 'center',
            borderRadius: 14,
          }}>
          <Text
            style={{
              fontSize: 36,
              marginTop: 12,
              color: '#ffff',
            }}>
            {otherUserId.current} is calling..
          </Text>
        </View>
        <View
          style={{
            justifyContent: 'center',
            alignItems: 'center',
          }}>
          <TouchableOpacity
            onPress={() => {
              processAccept();
              setType('WEBRTC_ROOM');
            }}
            style={{
              backgroundColor: 'green',
              borderRadius: 30,
              height: 60,
              aspectRatio: 1,
              justifyContent: 'center',
              alignItems: 'center',
            }}>
            <Text style={{color: 'white'}}>Call Answer</Text>
            {/* <CallAnswer height={28} fill={'#fff'} /> */}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const WebrtcRoomScreen = () => {
    console.log('REMOTE', remoteStream?.toURL());
    console.log('LOCAL', localStream?.toURL());
    return (
      <View
        style={{
          height: '100%',
          backgroundColor: 'pink',
        }}>
        {/* <View style={{ width: 300, height: 300 }}> */}
        {localStream ? (
          <RTCView
            objectFit={'cover'}
            style={{width: 300, height: 300, backgroundColor: 'blue'}}
            streamURL={localStream.toURL()}
          />
        ) : null}
        {/* </View>
        <View style={{ width: 300, height: 300 }}> */}
        {remoteStream ? (
          <RTCView
            objectFit={'cover'}
            style={{
              width: 300,
              height: 300,
              backgroundColor: 'blue',
              marginTop: 8,
            }}
            streamURL={remoteStream.toURL()}
          />
        ) : null}
        {/* </View> */}

        <View
          style={{
            marginVertical: 12,
            flexDirection: 'row',
            justifyContent: 'space-evenly',
          }}>
          <Button
            title="Call End"
            onPress={() => {
              leave();
              setlocalStream(null);
            }}
          />
          <Button
            title="Toggle Mic"
            onPress={() => {
              toggleMic();
            }}
          />
        </View>
        <View
          style={{
            marginVertical: 12,
            flexDirection: 'row',
            justifyContent: 'space-evenly',
          }}>
          <Button
            title="Toggle Cam"
            onPress={() => {
              toggleCamera();
            }}
          />

          <Button
            title="Switch Cam"
            onPress={() => {
              switchCamera();
            }}
          />
        </View>
      </View>
    );
  };

  switch (type) {
    case 'JOIN':
      return JoinScreen();
    case 'INCOMING_CALL':
      return IncomingCallScreen();
    case 'OUTGOING_CALL':
      return OutgoingCallScreen();
    case 'WEBRTC_ROOM':
      return WebrtcRoomScreen();
    default:
      return null;
  }
};

export default Container;
