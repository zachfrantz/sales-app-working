const captions = window.document.getElementById("captions");

async function getMicrophone() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    return new MediaRecorder(stream);
  } catch (error) {
    console.error("Error accessing microphone:", error);
    throw error;
  }
}

async function openMicrophone(microphone, socket) {
  return new Promise((resolve) => {
    microphone.onstart = () => {
      console.log("WebSocket connection opened");
      document.body.classList.add("recording");
      resolve();
    };

    microphone.onstop = () => {
      console.log("WebSocket connection closed");
      document.body.classList.remove("recording");
    };

    microphone.ondataavailable = (event) => {
      if (event.data.size > 0 && socket.readyState === WebSocket.OPEN) {
        socket.send(event.data);
      }
    };

    microphone.start(1000);
  });
}

async function closeMicrophone(microphone) {
  microphone.stop();
}

async function start(socket) {
  const listenButton = document.querySelector("#record");
  let microphone;

  console.log("client: waiting to open microphone");

  listenButton.addEventListener("click", async () => {
    if (!microphone) {
      try {
        microphone = await getMicrophone();
        await openMicrophone(microphone, socket);
      } catch (error) {
        console.error("Error opening microphone:", error);
      }
    } else {
      await closeMicrophone(microphone);
      microphone = undefined;
    }
  });
}

function handleTranscription(transcriptionText) {
  const transcriptionDiv = document.getElementById('transcription');
  if (transcriptionDiv) {
    const newTranscription = document.createElement('p');
    newTranscription.textContent = transcriptionText;
    transcriptionDiv.appendChild(newTranscription);
    
    // Autoscroll to the bottom of the transcription div
    transcriptionDiv.scrollTop = transcriptionDiv.scrollHeight;
  } else {
    console.error('Transcription element not found');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const socket = new WebSocket("ws://localhost:3000");

  socket.addEventListener("open", async () => {
    console.log("WebSocket connection opened");
    await start(socket);
  });

  socket.addEventListener("message", (event) => {
    console.log('Message from server ', event.data);
    try {
      const data = JSON.parse(event.data);
      console.log('Parsed data: ', data);

      if (data.transcript) {
        console.log('Transcript: ', data.transcript);
        displayTranscript(data.transcript);
      }

      if (data.followUpQuestions) {
        console.log('Follow-up Questions: ', data.followUpQuestions);
        displayFollowUpQuestions(data.followUpQuestions);
      }

      if (data.metadata) {
        console.log('Metadata: ', data.metadata);
      }

      // Ensure data.channel and data.channel.alternatives are defined before accessing them
      if (data.channel && data.channel.alternatives && data.channel.alternatives[0]) {
        const alternatives = data.channel.alternatives;
        console.log('Alternatives: ', alternatives);
      } else {
        console.log('No valid alternatives data received');
      }
    } catch (error) {
      console.error('Error parsing message from server: ', error);
    }
  });

  socket.addEventListener("close", () => {
    console.log("WebSocket connection closed");
  });
});

function displayTranscript(transcript) {
  const transcriptionDiv = document.getElementById('transcription');
  if (transcriptionDiv) {
    const newTranscription = document.createElement('p');
    newTranscription.textContent = transcript;
    transcriptionDiv.appendChild(newTranscription);
    
    // Autoscroll to the bottom of the transcription div
    transcriptionDiv.scrollTop = transcriptionDiv.scrollHeight;
  } else {
    console.error('Transcription element not found');
  }
}

function displayFollowUpQuestions(questions) {
  const questionsDiv = document.getElementById('suggested-questions'); // Updated ID
  if (questionsDiv) {
    const newQuestions = document.createElement('p');
    newQuestions.textContent = questions;
    questionsDiv.appendChild(newQuestions);
    
    // Autoscroll to the bottom of the questions div
    questionsDiv.scrollTop = questionsDiv.scrollHeight;
  } else {
    console.error('Follow-up Questions element not found');
  }
}
