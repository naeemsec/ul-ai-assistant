// ===== VOICE INPUT (Web Speech API — Chrome/Edge/Safari mein kaam karta hai; =====
const micBtn = document.getElementById("micBtn");
const voiceLangSelect = document.getElementById("voiceLangSelect");
const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
let currentSpeakerBtn = null;

const VOICE_LANG_KEY = "ul_ai_voice_lang";
function getVoiceLang() {
  return localStorage.getItem(VOICE_LANG_KEY) || "en-PK";
}

if (!SpeechRecognitionAPI) {
  micBtn.classList.add("hidden"); // browser support nahi karta — button hide
} else {
  const recognition = new SpeechRecognitionAPI();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = getVoiceLang();

  let isListening = false;

  recognition.onstart = () => {
    isListening = true;
    micBtn.classList.add("listening");
  };

  recognition.onend = () => {
    isListening = false;
    micBtn.classList.remove("listening");
  };

  recognition.onerror = (event) => {
    console.error("[Voice Input Error]", event.error);
    isListening = false;
    micBtn.classList.remove("listening");
    if (event.error === "not-allowed") {
      showToast("🎤 Microphone permission denied.");
    } else if (event.error === "no-speech") {
      showToast("🎤 Didn't catch that — try speaking right after tapping the mic.");
    } else if (event.error !== "aborted") {
      showToast("⚠️ Voice input failed. Please try again.");
    }
  };

  recognition.onresult = (event) => {
    let transcript = "";
    for (let i = 0; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
    }
    messageInput.value = transcript;
    autoResize(messageInput);
  };

  micBtn.addEventListener("click", () => {
    if (isListening) {
      recognition.stop();
    } else {
      messageInput.focus();
      recognition.start();
    }
  });

  // Settings mein language badalne par turant apply karo, aur agli visits ke liye save karo
  if (voiceLangSelect) {
    voiceLangSelect.value = getVoiceLang();
    voiceLangSelect.addEventListener("change", () => {
      recognition.lang = voiceLangSelect.value;
      localStorage.setItem(VOICE_LANG_KEY, voiceLangSelect.value);
    });
  }

  const voiceOutputLangSelect = document.getElementById("voiceOutputLangSelect");
  if (voiceOutputLangSelect) {
    voiceOutputLangSelect.value = localStorage.getItem("ul_ai_output_voice") || "Google US English";
    voiceOutputLangSelect.addEventListener("change", () => {
        localStorage.setItem("ul_ai_output_voice", voiceOutputLangSelect.value);
    });
  }
}

function createSpeakerButton(text) {
  const btn = document.createElement("button");
  btn.className = "copy-btn speaker-btn";
  btn.title = "Listen";
  btn.innerHTML = `<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5L6 9H2v6h4l5 4V5z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.54 8.46a5 5 0 010 7.07M19.07 4.93a10 10 0 010 14.14"/></svg>`;

  btn.addEventListener("click", () => toggleSpeech(text, btn));
  return btn;
}

function toggleSpeech(text, btn) {
  if (!window.speechSynthesis) {
    showToast("⚠️ Voice output is not supported in this browser.");
    return;
  }

  if (currentSpeakerBtn === btn && speechSynthesis.speaking) {
    speechSynthesis.cancel();
    resetSpeakerButton();
    return;
  }

  speechSynthesis.cancel();
  resetSpeakerButton();

  const cleanText = text.replace(/[*_`#>]/g, "");
  const utterance = new SpeechSynthesisUtterance(cleanText);

  const setVoiceAndSpeak = () => {
    const voice = getOutputVoice();
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang || "en-US";
    speechSynthesis.speak(utterance);
  };

  // Voices load hone ka wait karo
  const voices = speechSynthesis.getVoices();
  if (voices.length > 0) {
    setVoiceAndSpeak();
  } else {
    speechSynthesis.onvoiceschanged = () => {
      speechSynthesis.onvoiceschanged = null;
      setVoiceAndSpeak();
    };
  }
  return; // neeche wala speak() hata do
}

function resetSpeakerButton() {
  if (currentSpeakerBtn) currentSpeakerBtn.classList.remove("speaking");
  currentSpeakerBtn = null;
}

function getVoiceOutputLang() {
  return localStorage.getItem(VOICE_LANG_KEY) || "en-PK";
}
function getOutputVoice() {
  const voices = speechSynthesis.getVoices();
  const savedName = localStorage.getItem("ul_ai_output_voice") || "Google US English";
  return voices.find(v => v.name === savedName)
      || voices.find(v => v.lang.startsWith("en"))
      || voices[0];
}