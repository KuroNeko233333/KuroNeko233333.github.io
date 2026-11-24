const ownerUrl = "/__owner/reviews";
const tiers = ["夯", "顶级", "大众化", "路边", "拉完了"];
const cat = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#e2c27a" d="M4.6 9.2 4.4 3.6l4.6 3.3a9.6 9.6 0 0 1 6 0l4.6-3.3-.2 5.6c.9 1.3 1.4 2.8 1.4 4.4 0 4.3-3.9 7.2-8.8 7.2s-8.8-2.9-8.8-7.2c0-1.6.5-3.1 1.4-4.4Z"/><ellipse cx="9" cy="13" rx="1.2" ry="1.6" fill="#270d0c"/><ellipse cx="15" cy="13" rx="1.2" ry="1.6" fill="#270d0c"/><path d="M11.2 16.2h1.6l-.8.8z" fill="#270d0c"/></svg>';

let owner = false, preview = false, active = false;
let data, target, section, ownerbar, draft;
let saving = false, publishing = false, notice = "";

function element(tag, cls, text) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  return el;
}

function button(text, action, cls) {
  const el = element("button", cls, text);
  el.type = "button";
  el.onclick = action;
  return el;
}

function avatar() {
  const el = element("span", "zp-avatar");
  el.innerHTML = cat;
  return el;
}

function post(path, body) {
  return fetch(ownerUrl + path, {
    method: "POST",
    headers: {"Content-Type": "application/json", "X-Local-Reader": "1"},
    body: JSON.stringify(body),
  });
}

async function read(url) {
  try {
    const response = await fetch(url);
    if (response.ok) return await response.json();
  } catch {
    // The published edition is optional.
  }
  return null;
}

async function load() {
  if (["127.0.0.1", "localhost"].includes(location.hostname) && !document.querySelector('meta[name="catalog-web"]')) {
    data = await read(ownerUrl);
    owner = !!data?.entries;
  }
  if (!owner) {
    const url = new URL("../__ours/reviews.json", import.meta.url);
    url.searchParams.set("t", Math.floor(Date.now() / 60000));
    data = await read(url);
  }
  if (!owner && !Object.keys(data?.entries || {}).length) return;
  const css = element("link");
  css.rel = "stylesheet";
  css.href = new URL("./reviews.css", import.meta.url);
  css.onload = render;
  document.head.append(css);
}

function dirty() {
  return draft && ["body", "tier", "rules"].some(key => draft.value[key] !== draft.initial[key]);
}

function protectUnload(event) {
  event.preventDefault();
  event.returnValue = true;
}

function syncUnload() {
  if (dirty() || saving) window.addEventListener("beforeunload", protectUnload);
  else window.removeEventListener("beforeunload", protectUnload);
}

export function canLeave() {
  if (saving) return false;
  if (dirty() && !window.confirm("有尚未保存的改动，要放弃吗？")) return false;
  if (draft) {
    draft = null;
    syncUnload();
    render();
  }
  return true;
}

let reverting = false;
export function allowPopstate() {
  if (reverting) {
    reverting = false;
    return false;
  }
  if (canLeave()) return true;
  if (!draft) return true;
  const offset = draft.historyIndex - window.navigation?.currentEntry?.index;
  if (offset) {
    reverting = true;
    history.go(offset);
  } else {
    history.replaceState(draft.historyState, "", draft.url);
  }
  return false;
}

export function show(next, onPage) {
  target = next;
  active = onPage;
  render();
}

function edit(entry) {
  const initial = {tier: entry?.tier ?? null, body: entry?.body ?? "", rules: entry?.rules ?? "5.5e"};
  draft = {
    key: target.key,
    baseRevision: data.revision,
    value: {...initial},
    initial,
    url: location.href,
    historyIndex: window.navigation?.currentEntry?.index,
    historyState: history.state,
  };
  notice = "";
  render();
  const textarea = section.querySelector("textarea");
  textarea.setSelectionRange(0, 0);
  textarea.focus();
}

async function save(entry) {
  if (saving) return;
  const key = target.key;
  saving = true;
  syncUnload();
  for (const control of section.querySelectorAll("button, textarea")) control.disabled = true;
  let failed = false;
  try {
    const response = await post("/entry", {key, base_revision: draft?.baseRevision ?? data.revision, entry});
    if (!response.ok && response.status !== 409) throw new Error();
    data = await response.json();
    notice = response.status === 409 ? "这条在别的窗口改过，已载入最新内容" : "已保存 · 未发布";
    draft = null;
  } catch {
    notice = "保存失败，请重试";
    failed = true;
  } finally {
    saving = false;
    syncUnload();
    if (failed && section) {
      for (const control of section.querySelectorAll("button, textarea")) control.disabled = false;
      paintOwnerbar();
    } else render();
  }
}

function comment(entry, editable) {
  const wrapper = element("div", "zp-comment");
  const content = element("div");
  const meta = element("div", "zp-comment__meta");
  meta.append(element("b", "", "站长"));
  if (Number.isInteger(entry.tier) && tiers[entry.tier]) {
    const tier = element("span", "zp-tier-tag", tiers[entry.tier]);
    tier.dataset.t = entry.tier;
    meta.append(tier);
  }
  const stamp = entry.updated || entry.created;
  if (stamp) {
    const date = element("time", "", stamp.slice(0, 10));
    date.dateTime = stamp;
    meta.append(date);
  }
  if (editable) {
    const actions = element("span", "zp-comment__actions");
    actions.append(button("编辑", () => edit(entry)), button("删除", () => {
      if (window.confirm("删除这条站长点评？")) save(null);
    }));
    meta.append(actions);
  }
  const body = element("div", "zp-comment__body");
  for (const paragraph of entry.body.replace(/\r\n?/g, "\n").split(/\n(?:[ \t]*\n)+/)) {
    body.append(element("p", "", paragraph));
  }
  content.append(meta, body, element("div", "zp-comment__foot", `按 ${entry.rules} 规则`));
  wrapper.append(avatar(), content);
  return wrapper;
}

function composer() {
  const {value} = draft;
  const wrapper = element("div", "zp-compose");
  const form = element("form", "zp-compose__box");
  const tierRow = element("div", "zp-compose__tiers", "档位");
  const tierButtons = tiers.map((name, tier) => {
    const control = button(name, () => {
      value.tier = value.tier === tier ? null : tier;
      syncChoices();
    }, "zp-tier-tag");
    control.dataset.t = tier;
    return control;
  });
  tierRow.append(...tierButtons);
  const body = element("textarea");
  body.setAttribute("aria-label", "点评正文");
  body.placeholder = "写下站长点评";
  body.value = value.body;
  body.oninput = () => {
    value.body = body.value;
    body.setCustomValidity([...body.value].length > 20000 ? "请将点评缩短到 20000 字以内" : "");
    syncUnload();
  };
  const bar = element("div", "zp-compose__bar");
  const rules = ["5.5e", "5e"];
  const rulesButtons = rules.map(rule => button(rule, () => {
    value.rules = rule;
    syncChoices();
  }, "zp-compose__rules"));
  function syncChoices() {
    tierButtons.forEach((el, index) => el.setAttribute("aria-pressed", String(value.tier === index)));
    rulesButtons.forEach((el, index) => el.setAttribute("aria-pressed", String(value.rules === rules[index])));
    syncUnload();
  }
  syncChoices();
  const submit = element("button", "primary", "保存");
  submit.type = "submit";
  bar.append(...rulesButtons, button("取消", canLeave, "zp-compose__cancel"), submit);
  form.append(tierRow, body, bar);
  form.onsubmit = event => {
    event.preventDefault();
    save({...target.metadata, ...value});
  };
  wrapper.append(avatar(), form);
  return wrapper;
}

async function publish() {
  if (publishing || saving || !window.confirm("发布已经保存的站长点评？")) return;
  publishing = true;
  notice = "正在发布…";
  paintOwnerbar();
  try {
    let status = await (await post("/publish", {})).json();
    notice = status.message;
    if (status.reviews?.revision >= data.revision) {
      data = status.reviews;
      if (!draft && !saving) render();
      else paintOwnerbar();
    } else paintOwnerbar();
    while (status.state === "uploading") {
      await new Promise(resolve => setTimeout(resolve, 2000));
      status = await read(ownerUrl + "/publish-status");
      if (!status) throw new Error();
    }
    notice = status.message || "发布失败，请重试";
  } catch {
    notice = "无法获取发布结果，请重试";
  } finally {
    publishing = false;
    paintOwnerbar();
  }
}

function leavePreview(event) {
  if (event.key !== "Escape") return;
  preview = false;
  window.removeEventListener("keydown", leavePreview);
  render();
  ownerbar?.querySelector("button").focus();
}

function paintOwnerbar() {
  ownerbar?.remove();
  ownerbar = null;
  if (!owner || preview || !active) return;
  ownerbar = element("aside", "zp-ownerbar");
  const status = element("span", "zp-ownerbar__status", notice);
  status.setAttribute("role", "status");
  const view = button("预览访客看到的样子", () => {
    if (!canLeave()) return;
    preview = true;
    window.addEventListener("keydown", leavePreview);
    render();
  });
  view.title = "预览时按 Esc 返回站长模式";
  const publishButton = button("发布", publish);
  publishButton.disabled = publishing;
  ownerbar.append(element("i"), element("b", "", "站长模式"),
    element("span", "zp-ownerbar__count", `${data.unpublished_count ?? 0} 条未发布`), status, view, publishButton);
  document.body.append(ownerbar);
}

function render() {
  section?.remove();
  section = null;
  paintOwnerbar();
  if (!target?.anchor.isConnected || !data) return;
  const entry = data.entries?.[target.key];
  const editable = owner && !preview;
  if (!entry && !editable) return;
  section = element("section", "zp-comments");
  // On a class page the comment sits under the subclass buttons: name the subclass it is about.
  const heading = target.metadata?.kind === "subclasses" && target.metadata.name ? "站长点评 · " + target.metadata.name : "站长点评";
  if (editable && draft?.key === target.key) {
    section.append(element("h2", "zp-comments__h", heading), composer());
  } else if (entry) {
    section.append(element("h2", "zp-comments__h", heading), comment(entry, editable));
  } else {
    section.append(button("＋ 写站长点评", () => edit(), "zp-comment__write"));
  }
  if (target.after) target.anchor.after(section);
  else target.anchor.append(section);
}

load();
