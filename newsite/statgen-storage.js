let db;

function database() {
    db ??= new Promise((resolve, reject) => {
        if (globalThis.localforage) return resolve(globalThis.localforage);
        const script = document.createElement("script");
        script.src = new URL("../lib/localforage.js", import.meta.url);
        script.onload = () => resolve(globalThis.localforage);
        script.onerror = () => { db = null; reject(Error("无法打开属性存档库")); };
        document.head.append(script);
    });
    return db;
}

const slot = "state_statgen.html";
export async function readState() {
    return (await database()).getItem(slot);
}
export async function writeState(value) {
    return (await database()).setItem(slot, value);
}

export function downloadState(state) {
    const url = URL.createObjectURL(new Blob([JSON.stringify({...state, fileType: "statgen"}, null, 2)], {type: "application/json"}));
    Object.assign(document.createElement("a"), {href: url, download: "statgen.json"}).click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
