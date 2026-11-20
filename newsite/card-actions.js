const actions = [
    ["弹出卡片", "\ue164", "open"],
    ["复制筛选链接", "\ue112", "copy"],
    ["跳转英文源站", "\ue135", "english"],
];

export function bindCardActions(container, table, card, kind) {
    const toolbar = document.getElementById("detail-tools");
    if (!toolbar) return;
    let group = toolbar.querySelector(".card-actions");
    if (!group) {
        group = document.createElement("div");
        group.className = "card-actions";
        for (const [label, glyph, action] of actions) {
            const button = document.createElement("button");
            button.type = "button"; button.title = label;
            button.setAttribute("aria-label",label);
            button.dataset.action = action; button.textContent = glyph;
            group.append(button);
        }
        toolbar.append(group);
    }
    const english = card.model?.ENG_name || table.querySelector(".ve-stats__eh-name")?.textContent.trim();
    const source = card.model?.source || [...table.querySelector(".stats__h-source-abbreviation")?.classList || []]
        .find(c => c.startsWith("ve-source__"))?.slice("ve-source__".length);
    group.querySelector('[data-action="english"]').disabled = !(english && source);
    group.onclick = async event => {
        const button = event.target.closest("button");
        if (!button) return;
        const url = new URL(location.href);
        if (!url.hash) url.hash = container.dataset.hash || "";
        if (button.dataset.action === "english") {
            const key = [english,source].map(s => encodeURIComponent(s.toLowerCase()).toLowerCase()).join("_");
            window.open("https://5e.tools/"+kind+".html#"+key,"_blank","noopener");
        } else if (button.dataset.action === "copy") {
            for (const [k,v] of new URLSearchParams(history.state?.preferences))
                if (!url.searchParams.has(k)) url.searchParams.set(k,v);
            try {
                await navigator.clipboard.writeText(url.href);
                button.title = "已复制";
            } catch {
                window.prompt("复制筛选链接",url.href);
            }
        } else {
            const dialog = document.createElement("dialog");
            dialog.className = "card-popout";
            const close = document.createElement("button");
            close.type = "button"; close.textContent = "关闭"; close.onclick = () => dialog.close();
            dialog.append(close,table.cloneNode(true));
            dialog.addEventListener("close",() => dialog.remove(),{once:true});
            document.body.append(dialog);
            dialog.showModal();
        }
    };
}
