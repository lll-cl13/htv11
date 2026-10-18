export const speakFeedback = (message, isWarning = false) => {
  // Stop any currently playing speech
  window.speechSynthesis.cancel();

  // Warning message
  if (isWarning) {
    const warningSpeech = new SpeechSynthesisUtterance(
      "Attention."
    );

    warningSpeech.lang = "en-CA";
    warningSpeech.rate = 0.9;
    warningSpeech.pitch = 0.8;

    warningSpeech.onend = () => {
      const feedbackSpeech = new SpeechSynthesisUtterance(message);

      feedbackSpeech.lang = "en-CA";
      feedbackSpeech.rate = 1;
      feedbackSpeech.pitch = 1;

      window.speechSynthesis.speak(feedbackSpeech);
    };

    window.speechSynthesis.speak(warningSpeech);

    return;
  }

  // Feedback and Insights
  const feedbackSpeech = new SpeechSynthesisUtterance(message);

  feedbackSpeech.lang = "en-CA";
  feedbackSpeech.rate = 1;
  feedbackSpeech.pitch = 1;

  window.speechSynthesis.speak(feedbackSpeech);
};
