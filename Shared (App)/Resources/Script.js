function show(platform, enabled) {
    platform.split(' ').forEach(p => document.body.classList.add(`platform-${p}`));
    document.body.classList.add('loaded')

    if (typeof enabled === "boolean") {
        document.body.classList.toggle(`state-on`, enabled);
        document.body.classList.toggle(`state-off`, !enabled);
    } else {
        document.body.classList.remove(`state-on`);
        document.body.classList.remove(`state-off`);
    }
}

function openPreferences() {
    webkit.messageHandlers.controller.postMessage("open-preferences");
}

document.querySelectorAll("button.open-preferences").forEach(e => e.addEventListener("click", openPreferences));
