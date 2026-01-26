// prompt-typing.js

export function initPromptTyping(textarea, suggestions = []) {
    if (!textarea || suggestions.length === 0) return;

    let suggestionIndex = 0;
    let charIndex = 0;
    let isDeleting = false;
    let typeSpeed = 100;

    function type() {
        const currentSuggestion = suggestions[suggestionIndex];
        
        // If user starts typing or clicks, stop the effect or clear it
        if (document.activeElement === textarea && textarea.value.length > 0) {
            textarea.placeholder = "Define your digital masterpiece...";
            setTimeout(type, 2000); // Check again later
            return;
        }

        if (isDeleting) {
            textarea.placeholder = currentSuggestion.substring(0, charIndex - 1);
            charIndex--;
            typeSpeed = 50;
        } else {
            textarea.placeholder = currentSuggestion.substring(0, charIndex + 1);
            charIndex++;
            typeSpeed = 100;
        }

        // Logic for switching states
        if (!isDeleting && charIndex === currentSuggestion.length) {
            isDeleting = true;
            typeSpeed = 2000; // Pause at the end of the sentence
        } else if (isDeleting && charIndex === 0) {
            isDeleting = false;
            suggestionIndex = (suggestionIndex + 1) % suggestions.length;
            typeSpeed = 500; // Pause before starting next sentence
        }

        setTimeout(type, typeSpeed);
    }

    type();
}
