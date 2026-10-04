// Shared by the server layout (inline boot script) and client preferences.
export const THEME_KEY = "easyapply-theme";
export const LANGUAGE_KEY = "easyapply-language";

// Applies the saved (or system) theme and language before the first paint so
// the page never flashes the wrong colours.
export const bootScript = `try{var t=localStorage.getItem("${THEME_KEY}");var d=t?t==="dark":window.matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.dataset.theme=d?"dark":"light";if(localStorage.getItem("${LANGUAGE_KEY}")==="hi")document.documentElement.lang="hi"}catch(e){document.documentElement.dataset.theme="light"}`;
