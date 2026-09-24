(() => {
  "use strict";
  const G = window.Wildwood;
  const P = window.GamePreview;
  const previewMode = new URLSearchParams(location.search).has("preview");
  let STORAGE_KEY = previewMode ? "mimir-opoly-preview-v1" : "wildwood-card-board-v1";
  let previewConfig = null;
  const storage = () => previewMode ? window.sessionStorage : window.localStorage;
  const $ = id => document.getElementById(id);
  let state = { version: 1, config: G.clone(G.eventConfig), run: null };
  let storageBlocked = false;
  let rawSaved = null;
  let hostOpen = false;
  let draft = null;
  let dirty = false;
  let armedMode = null;
  let confirmAction = null;
  let lastPosition = -1;
  let lastCardCount = null;
  let pawnAnimation = null;
  let cardAnimation = null;
  let dealing = false;
  let presentationId = 0;
  let movementMs = 0;
  let celebratedRun = null;

  function node(tag, options = {}, ...children) {
    const element = document.createElement(tag);
    Object.entries(options).forEach(([key, value]) => {
      if (key === "className") element.className = value;
      else if (key === "text") element.textContent = value;
      else if (key.startsWith("on")) element.addEventListener(key.slice(2).toLowerCase(), value);
      else if (key === "checked" || key === "disabled") element[key] = value;
      else element.setAttribute(key, value);
    });
    children.flat().filter(child => child !== null && child !== undefined).forEach(child => element.append(child));
    return element;
  }
  function button(text, action, secondary = false, disabled = false) {
    return node("button", { type: "button", text, onclick: action, className: secondary ? "secondary" : "", disabled });
  }
  function p(text, className = "") { return node("p", { text, className }); }
  function notice(text) { return p(text, "notice"); }
  function richParagraphs(text, emphasis = [], className = "") {
    return text.split(/\n\s*\n/).filter(Boolean).map(paragraph => {
      const element = node("p", { className });
      let rest = paragraph;
      while (rest) {
        const match = emphasis.filter(Boolean).map(phrase => ({ phrase, at: rest.indexOf(phrase) }))
          .filter(item => item.at >= 0).sort((a, b) => a.at - b.at || b.phrase.length - a.phrase.length)[0];
        if (!match) { element.append(rest); break; }
        element.append(rest.slice(0, match.at), node("strong", { text: match.phrase }));
        rest = rest.slice(match.at + match.phrase.length);
      }
      return element;
    });
  }
  function microsoftBrand(compact = false) {
    return node("span", { className: `microsoft-brand ${compact ? "compact-brand" : ""}`, "aria-label": "Microsoft" },
      node("span", { className: "microsoft-mark", "aria-hidden": "true" }, [0, 1, 2, 3].map(() => node("i"))),
      compact ? null : node("span", { text: "Microsoft" }));
  }
  function icon(name) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "board-icon");
    svg.setAttribute("viewBox", "0 0 64 64");
    svg.setAttribute("aria-hidden", "true");
    if (name === "go-arrow") svg.setAttribute("preserveAspectRatio", "none");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", `#icon-${name}`);
    svg.append(use);
    return svg;
  }
  const referenceIcons = { community: "chest.png", chance: "chance.png", station: "railroad.png" };
  function graphic(name, useReference) {
    return useReference && referenceIcons[name]
      ? node("img", { className: "board-icon reference-icon", src: `board-assets/${referenceIcons[name]}?v=${P.REVISION}`, alt: "", "aria-hidden": "true", draggable: "false" })
      : icon(name);
  }
  function positionPanel(element, point) {
    element.style.left = `${point.left}%`; element.style.top = `${point.top}%`;
    element.style.width = `${point.width}%`; element.style.height = `${point.height}%`;
  }
  function confirm(title, description, action) {
    $("confirm-title").textContent = title;
    $("confirm-description").textContent = description;
    confirmAction = action;
    $("confirm-dialog").showModal();
    $("confirm-cancel").focus();
  }
  $("confirm-cancel").onclick = () => { confirmAction = null; $("confirm-dialog").close(); };
  $("confirm-dialog").addEventListener("cancel", () => { confirmAction = null; });
  $("confirm-accept").onclick = () => {
    const action = confirmAction;
    confirmAction = null;
    $("confirm-dialog").close();
    if (action) action();
  };
  function download(filename, content, type = "application/json") {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = node("a", { href: url, download: filename });
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function storageError(message) {
    storageBlocked = true;
    const box = $("storage-error");
    box.hidden = false;
    box.replaceChildren(p(`Storage problem: ${message} Game actions are blocked to protect progress.`, "error-text"),
      p(previewMode ? "Only this isolated preview is blocked. Live storage has not been touched. Check the preview URL or retry." : "Use one browser tab and the same file address or local URL. Do not use private browsing. You can retry, or deliberately discard this site's saved setup and run.", "small"),
      button("Retry saved data", () => { load(); render(); }, true),
      button("Download saved data", () => download("wildwood-recovery.json", rawSaved || JSON.stringify(state, null, 2)), true),
      button(previewMode ? "Discard preview data" : "Discard saved data", () => confirm(previewMode ? "Discard this preview?" : "Discard all saved data?", previewMode ? "Only this preview's practice progress will be reset. Live data is untouched." : "This removes the saved run AND card setup at this browser address. Download a backup first. The MIMIR-OPOLY event setup will replace them.", () => {
        try {
          if (previewMode && !previewConfig) throw new Error("Correct the invalid preview URL before continuing.");
          const fresh = { version: 1, config: G.clone(previewConfig || G.eventConfig), run: null };
          storage().setItem(STORAGE_KEY, JSON.stringify(fresh));
          rawSaved = JSON.stringify(fresh);
          state = fresh; storageBlocked = false; draft = null; dirty = false; armedMode = previewMode ? "demo" : null;
          box.hidden = true; render();
        } catch (error) { storageError(error.message); }
      }), true));
  }
  function validateState(value) {
    if (!value || value.version !== 1) throw new Error("Unrecognized saved data format.");
    return { version: 1, config: G.validateConfig(value.config), run: value.run === null ? null : G.validateRun(value.run) };
  }
  function load() {
    try {
      if (previewMode) {
        const preview = P.resolve(location.href);
        previewConfig = preview.config; STORAGE_KEY = preview.key;
      }
      rawSaved = storage().getItem(STORAGE_KEY);
      const priorPreview = previewMode && rawSaved === null ? findPriorPreview() : null;
      const loaded = rawSaved === null ? priorPreview || { version: 1, config: G.clone(previewConfig || G.eventConfig), run: null } : validateState(JSON.parse(rawSaved));
      validatePreview(loaded);
      if (loaded.run) {
        if (G.eventUpdateFields(loaded.run.config).length) G.tick(loaded.run);
        else G.continuePlay(loaded.run);
      }
      storage().setItem(STORAGE_KEY, JSON.stringify(loaded));
      rawSaved = JSON.stringify(loaded);
      state = loaded; storageBlocked = false; draft = null; dirty = false; armedMode = previewMode && !loaded.run ? "demo" : null;
      $("storage-error").hidden = true;
    } catch (error) { storageError(error.message); }
  }
  function findPriorPreview() {
    const matches = [];
    const source = storage();
    for (let i = 0; i < source.length; i++) {
      const key = source.key(i);
      if (!key.startsWith("mimir-opoly-preview-v1:") || key === STORAGE_KEY) continue;
      const candidate = validateState(JSON.parse(source.getItem(key)));
      if (P.matchesSetup(candidate.config, previewConfig) &&
          (!candidate.run || candidate.run.mode === "demo" && P.matchesSetup(candidate.run.config, previewConfig))) matches.push(candidate);
    }
    const updated = matches.filter(candidate => !G.eventUpdateTargets(candidate).length);
    const candidates = updated.length ? updated : matches;
    if (candidates.length > 1) throw new Error("More than one matching previous preview exists. Existing data was preserved; use the original preview tab or export its state before choosing a restart.");
    return candidates[0] || null;
  }
  function validatePreview(value) {
    if (!previewMode) return;
    if (!previewConfig || !P.matchesSetup(value.config, previewConfig) ||
        value.run && (value.run.mode !== "demo" || !P.matchesSetup(value.run.config, previewConfig))) {
      throw new Error("Preview data does not match its fixed setup link. Discard preview data to restart only this practice game.");
    }
  }
  function persist(next) {
    if (storageBlocked) return false;
    try {
      const validated = validateState(next);
      validatePreview(validated);
      const serialized = JSON.stringify(validated);
      if (storage().getItem(STORAGE_KEY) !== rawSaved) throw new Error("Saved data changed in another tab. Close the other tab and retry before writing here.");
      storage().setItem(STORAGE_KEY, serialized);
      rawSaved = serialized; state = validated;
      return true;
    } catch (error) { storageError(error.message); return false; }
  }
  function changeRun(action, focus = false) {
    if (storageBlocked || !state.run) return false;
    const next = G.clone(state);
    let result;
    try { result = action(next.run); G.continuePlay(next.run); }
    catch (error) { hostFeedback(error.message, true); return false; }
    if (!persist(next)) return false;
    setPlayerMessage("");
    render();
    if (focus && !hostOpen) $("objective").focus();
    return result;
  }
  function formatTime(ms) {
    const seconds = Math.ceil(ms / 1000);
    return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
  }
  function updateClock() {
    const run = state.run;
    const ms = run ? G.remaining(run) : state.config.durationMinutes * 60000;
    $("clock").textContent = formatTime(ms);
    $("clock").setAttribute("aria-label", `${Math.ceil(ms / 1000)} seconds remaining`);
    $("clock").classList.toggle("urgent", Boolean(run && run.status === "running" && ms <= 300000));
    $("clock-label").textContent = !run ? "READY WHEN YOU ARE" : run.status === "paused" ? "CLOCK PAUSED" : run.status === "won" ? "TIME REMAINING" : run.status === "timeout" ? "TIME IS UP" : "TIME TO RETURN";
    const hostClock = $("host-clock");
    if (hostClock) hostClock.textContent = `${formatTime(ms)} · ${run ? run.status.toUpperCase() : "NOT STARTED"}`;
  }
  function renderBoard(config) {
    const run = state.run;
    const position = run ? run.index + 1 : 0;
    const geometry = G.boardGeometry(config.cards.length);
    const layout = geometry.spaces;
    const reference = config.presetId === G.eventConfig.presetId;
    const board = $("board");
    board.replaceChildren();
    board.parentElement.classList.toggle("dense", config.cards.length > 12);
    board.parentElement.classList.toggle("mint-board", config.presentation?.boardTone === "mint");
    board.parentElement.classList.toggle("reference-board", reference);
    document.querySelector(".card-table").classList.toggle("reference-cards", reference);
    const art = $("board-art");
    art.replaceChildren();
    geometry.connectors.forEach(point => {
      const lane = node("div", { className: `track-connector side-${point.side}` }, icon("arrow"));
      positionPanel(lane, point); art.append(lane);
    });
    geometry.corners.forEach((point, index) => {
      const artwork = reference
        ? node("img", { className: "reference-corner", src: `board-assets/${["just-visiting.png", "free-parking.png", "go-to-jail.png"][index]}?v=${P.REVISION}`, alt: "", "aria-hidden": "true", draggable: "false" })
        : index === 0
        ? node("div", { className: "just-visiting" },
          node("div", { className: "visiting-cell" }, node("strong", { text: "IN JAIL" }), icon("jail")),
          node("strong", { className: "visiting-just", text: "JUST" }),
          node("strong", { className: "visiting-label", text: "VISITING" }))
        : node("div", { className: "corner-illustration" }, node("strong", { text: index === 1 ? "ONWARD" : "HOME STRETCH" }),
          icon(index === 1 ? "compass" : "finish"), node("small", { text: "PASS THROUGH" }));
      const corner = node("div", { className: `track-corner corner-${index}` }, artwork);
      positionPanel(corner, point); art.append(corner);
    });
    layout.forEach((point, index) => {
      const current = index === position;
      const completed = index < position || (run && run.phase === "solved" && index === position);
      const terminal = index === 0 || index === layout.length - 1;
      const style = terminal ? { type: index === 0 ? "go" : "finish", group: "ink" } : G.cardStyle(config.cards[index - 1], index - 1);
      const view = terminal ? null : G.cardView(run, config.cards[index - 1], index - 1);
      const label = index === 0 ? "GO / START" : terminal ? "FINISH" : `Space ${index}, ${view.boardLabel}`;
      const face = node("div", { className: "space-face", "aria-hidden": "true" },
        terminal ? null : node("span", { className: "property-band" }),
        node("strong", { className: terminal ? "track-label" : "tile-title", text: terminal ? index === 0 ? "GO" : "FINISH" : view.boardLabel }),
        view?.branding === "microsoft" ? microsoftBrand(true) : graphic(terminal ? index === 0 ? "go-arrow" : "finish" : style.type, reference),
        terminal ? node("span", { className: "space-number", text: index === 0 ? "START HERE" : "YOU MADE IT" }) :
          node("span", { className: "space-number" }, node("span", { className: "space-index", text: String(index).padStart(2, "0") }),
            node("span", { className: "space-status", text: ` / ${completed ? "SOLVED" : "CHALLENGE"}` })));
      if (reference && index === 0) face.replaceChildren(node("img", { className: "reference-corner", src: `board-assets/go.png?v=${P.REVISION}`, alt: "", "aria-hidden": "true", draggable: "false" }));
      const item = node("li", { className: `track-space side-${point.side} type-${style.type} group-${style.group} ${terminal ? "terminal-space" : ""} ${current ? "current" : ""} ${completed ? "complete" : ""}`,
        "data-side": point.side, "aria-label": `${label}${current ? ", your team is here" : completed ? ", completed" : ", pending"}` },
        face, completed ? node("span", { className: "space-check", "aria-hidden": "true", text: "\u2713" }) : null);
      positionPanel(item, point);
      if (current) item.setAttribute("aria-current", "step");
      board.append(item);
    });
    $("board-title").textContent = reference && config.title === "MIMIR-OPOLY" ? "MIMIROPOLY" : config.title;
    $("board-title").classList.toggle("long-title", config.title.length > 32);
    $("board-title").classList.toggle("very-long-title", config.title.length > 60);
    renderDecks(config);
    sizeBoardSpaces();
    const pawn = $("team-pawn");
    const destination = layout[position];
    pawn.style.left = `${destination.x}%`;
    pawn.style.top = `${destination.y}%`;
    movementMs = 0;
    if (run && lastPosition >= 0 && position > lastPosition && lastCardCount === config.cards.length && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      movementMs = 750;
      pawnAnimation = pawn.animate(G.travelPath(layout, lastPosition, position).map(point => ({ left: `${point.x}%`, top: `${point.y}%`, offset: point.offset })),
        { duration: movementMs, easing: "ease-in-out" });
    }
    lastPosition = position;
    lastCardCount = config.cards.length;
  }
  function sizeBoardSpaces() {
    const board = $("board");
    const bounds = board.getBoundingClientRect();
    if (!bounds.width) return;
    Array.from(board.children).forEach(space => {
      const vertical = ["left", "right"].includes(space.dataset.side);
      const face = space.querySelector(".space-face");
      face.style.width = `${vertical ? space.clientHeight : space.clientWidth}px`;
      face.style.height = `${vertical ? space.clientWidth : space.clientHeight}px`;
    });
    board.parentElement.style.setProperty("--pawn-size", `${Math.max(19, Math.min(48, bounds.width * .06))}px`);
  }
  function renderDecks(config) {
    const run = state.run;
    const active = run && run.status !== "won" ? G.cardStyle(G.currentCard(run), run.index).type : null;
    for (const type of ["chance", "community"]) {
      const face = $(`${type}-deck`).querySelector(".pile-face");
      const art = config.presetId === G.eventConfig.presetId
        ? node("img", { className: "board-icon reference-icon", src: `board-assets/${type === "chance" ? "chance-deck.png" : "chest.png"}?v=${P.REVISION}`, alt: "", "aria-hidden": "true", draggable: "false" })
        : icon(type);
      face.querySelector(".board-icon").replaceWith(art);
      const configured = config.cards.filter((card, i) => G.cardStyle(card, i).type === type).length;
      const left = config.cards.filter((card, i) => (!run || i >= run.index) && G.cardStyle(card, i).type === type).length;
      const isCurrent = active === type;
      $(`${type}-deck`).classList.toggle("active-deck", isCurrent);
      $(`${type}-status`).textContent = isCurrent ? "CURRENT CARD" : configured === 0 ? "Not used in this setup" : left === 0 ? "All played" : `${left} in the fixed sequence`;
      $(`${type}-deck`).setAttribute("aria-label", `${G.SPACE_TYPES[type]} deck. ${isCurrent ? "Current card is shown beside the board." : configured ? `${left} cards remaining in the fixed sequence. Not a draw button.` : "No cards of this type configured. Choose a type in Host / setup."}`);
    }
  }
  function cancelPresentation() {
    presentationId += 1;
    if (pawnAnimation) pawnAnimation.cancel();
    if (cardAnimation) cardAnimation.cancel();
    pawnAnimation = null; cardAnimation = null; dealing = false; movementMs = 0;
    $("objective").inert = false;
    $("objective").removeAttribute("aria-hidden");
    $("answer-controls").inert = false;
    $("card-stack").classList.remove("is-dealing");
  }
  function presentCard() {
    const run = state.run;
    const config = run ? run.config : state.config;
    const minimal = Boolean(config.presentation?.minimalCards);
    const count = run ? run.config.cards.length - run.index : state.config.cards.length;
    $("deck-count").textContent = `${Math.max(0, count)} ${count === 1 ? "card" : "cards"} left`;
    $("deal-status").hidden = minimal;
    $("deck-rule").hidden = minimal;
    $("deck-rule-text").textContent = run && G.movementMode(run) === "auto" ? "Only your current card is playable. Correct answers move your token and reveal the next card." : "Only your current card is playable. Correct answers unlock one move; moving reveals the next prescribed card.";
    $("deal-status").textContent = !run ? "Your game is ready when you are." : run.status === "won" ? "Every card played." : run.status !== "running" ? "The deck is waiting for your team." : G.movementMode(run) === "manual" ? "Solve this card, then move one space." : "Solve this card. Your pawn and the next card will take it from there.";
    $("card-stack").classList.toggle("deck-empty", count === 0);
    if (!movementMs || !run || run.status !== "running") return;
    const id = presentationId;
    dealing = true;
    $("objective").inert = true;
    $("answer-controls").inert = true;
    $("objective").setAttribute("aria-hidden", "true");
    $("card-stack").classList.add("is-dealing");
    $("deal-status").textContent = "Moving your pawn... turning over the next card.";
    cardAnimation = $("card-turner").animate([
      { transform: "translateY(-6px) rotateY(180deg)", offset: 0 },
      { transform: "translateY(-18px) rotateY(95deg)", offset: .45 },
      { transform: "translateY(0) rotateY(0)", offset: 1 }
    ], { duration: 600, delay: movementMs, fill: "both", easing: "ease-in-out" });
    cardAnimation.onfinish = () => {
      if (id !== presentationId) return;
      dealing = false;
      $("objective").inert = false;
      $("answer-controls").inert = false;
      $("objective").removeAttribute("aria-hidden");
      $("card-stack").classList.remove("is-dealing");
      $("deal-status").textContent = "Your next card is ready. Solve it to keep moving.";
      if (!hostOpen && !$("confirm-dialog").open && $("player-answer")) $("player-answer").focus({ preventScroll: true });
    };
  }
  function setPlayerMessage(text, error = false) {
    $("player-message").textContent = text;
    $("player-message").classList.toggle("error", error);
  }
  function renderPlayer() {
    const run = state.run;
    const config = run ? run.config : state.config;
    const presentation = config.presentation;
    const minimal = Boolean(presentation?.minimalCards);
    const updatePending = G.eventUpdateFields(config).length > 0;
    $("event-update-banner").hidden = !G.eventUpdateTargets(state).length;
    $("player-view").classList.toggle("minimal-cards", minimal);
    $("game-title").textContent = config.title;
    document.querySelector(".brand-mark").textContent = Array.from(config.title.trim())[0].toUpperCase();
    document.title = `${config.title} | Card board`;
    $("mode-badge").textContent = previewMode ? "PREVIEW / NOT LIVE" : run ? `${run.mode.toUpperCase()} GAME` : G.readiness(config).length ? "DEMO / SETUP" : "READY TO PLAY";
    $("journey-status").textContent = run ? run.status === "won" ? "The path is complete. You made it home." : `One team · ${run.completed.length} of ${config.cards.length} cards solved` : "Your puzzles. Your cards. One path home.";
    $("progress-label").textContent = `${config.cards.length} cards + START + FINISH`;
    renderBoard(config);
    const panel = $("objective");
    panel.replaceChildren();
    const controls = $("answer-controls");
    controls.replaceChildren();
    $("celebration").replaceChildren();
    const style = run && run.status !== "won" ? G.cardStyle(G.currentCard(run), run.index) : { type: "property", group: "brown" };
    $("card-stack").className = `card-stack type-${style.type} group-${style.group}`;
    $("active-deck-label").textContent = run && run.status !== "won" ? `${G.SPACE_TYPES[style.type]} / DRAWN CARD` : "YOUR GAME CARD";
    $("card-back-title").textContent = config.title;
    $("card-back-type").textContent = G.SPACE_TYPES[style.type];
    $("card-back-icon").replaceChildren(graphic(style.type, config.presetId === G.eventConfig.presetId));
    if (!run) {
      if (!minimal) panel.append(node("span", { className: "eyebrow", text: "THE ADVENTURE IS YOURS" }));
      panel.append(node("h2", { text: presentation?.openingTitle || config.title }),
        ...richParagraphs(config.intro, ["GO DIRECTLY TO JAIL!", "BANK"], "story-copy"));
      if (!minimal) panel.append(p("SOLVE A CARD  \u2192  MOVE ONE SPACE  \u2192  THE NEXT CARD", "flow-caption"));
      if (armedMode || minimal) {
        if (!minimal) controls.append(notice(armedMode === "demo" ? "DEMO PLAY. These are interface examples, not your room's puzzles." : "Host approved. The clock starts only when you begin."));
        controls.append(button(presentation?.startLabel || (armedMode === "demo" ? "Begin demo game" : "Begin game"), () => {
            if (state.run || !armedMode || storageBlocked || updatePending) return;
            try {
              const next = G.clone(state);
              next.run = G.start(state.config, armedMode);
              G.continuePlay(next.run);
              if (persist(next)) { armedMode = null; render(); if (!dealing) $("objective").focus(); }
            } catch (error) { setPlayerMessage(error.message, true); }
          }, false, storageBlocked || !armedMode || updatePending));
      } else {
        controls.append(p("The clock is stopped. The host can edit cards or approve the start.", "muted small"),
          button("Host: edit cards or begin", openHost, false, storageBlocked));
      }
      return;
    }
    if (run.status === "won") {
      if (presentation) {
        panel.append(node("h2", { text: presentation.successTitle }),
          ...richParagraphs(presentation.successText, ["FREE SNACKS!"]),
          p(`Time remaining: ${formatTime(run.finalTimeMs)}`, "finish-time"));
        if (celebratedRun !== run.startedAt && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
          celebratedRun = run.startedAt;
          $("celebration").append(...Array.from({ length: 22 }, (_, i) => {
            const confetti = node("i", { className: "confetti" });
            confetti.style.setProperty("--confetti-x", `${(i * 37) % 100}%`);
            confetti.style.setProperty("--confetti-delay", `${(i % 5) * 80}ms`);
            confetti.style.setProperty("--confetti-turn", `${(i % 2 ? 1 : -1) * (180 + i * 17)}deg`);
            return confetti;
          }));
        }
        return;
      }
      panel.append(node("span", { className: "eyebrow", text: "FINISH / EXPEDITION COMPLETE" }),
        node("h2", { text: "You found the way home." }),
        p("Every card solved. Every space travelled. The board is complete."),
        node("strong", { className: "finish-time", text: `${formatTime(run.finalTimeMs)} to spare` }),
        p(run.mode === "demo" ? "Demo completed. The host can now replace the example cards with your own." : "Your time is frozen and your victory is saved.", "muted small"));
      if (run.overrides.length) panel.append(p(`${run.overrides.length} card(s) awarded by the host.`, "small"));
      return;
    }
    if (run.status === "timeout") {
      if (presentation) {
        panel.append(node("h2", { text: presentation.timeoutTitle }), ...richParagraphs(presentation.timeoutText));
        return;
      }
      panel.append(node("span", { className: "eyebrow", text: "TIME IS UP" }), node("h2", { text: "The wildwood holds its breath." }),
        p("The expedition has run out of time. Answers and movement are stopped."),
        p("The host may add time and explicitly resume, or reset for a new game. The room doors always remain unlocked.", "muted"),
        button("Host controls", openHost, true));
      return;
    }
    if (run.status === "paused") {
      panel.append(node("span", { className: "eyebrow", text: "PAUSED BY THE HOST" }), node("h2", { text: "Take a breath." }),
        p("The clock, card, and team position are saved. Play resumes when the host is ready."),
        button("Host controls", openHost, true));
      return;
    }
    const card = G.currentCard(run);
    const view = G.cardView(run, card, run.index);
    if (!minimal) {
      panel.append(node("div", { className: "card-banner" }, icon(style.type), node("strong", { text: G.SPACE_TYPES[style.type] })),
        node("span", { className: "eyebrow", text: `SPACE ${run.index + 1} / ${config.cards.length}` }));
    }
    if (view.branding === "microsoft") panel.append(node("div", { className: "building-brand" }, microsoftBrand()));
    if (view.price !== null || minimal && ["chance", "community"].includes(style.type)) panel.append(graphic(style.type, config.presetId === G.eventConfig.presetId));
    if (view.title || !minimal) panel.append(node("h2", { text: view.title || `Card ${run.index + 1}` }));
    if (view.prompt) panel.append(...richParagraphs(view.prompt, view.emphasis, "card-prompt"));
    if (view.price !== null) panel.append(p(`Price: ${view.price}`, "property-price"));
    if (run.phase === "drawn" || run.phase === "solved") {
      if (run.mode === "demo" && !minimal) panel.append(p("DEMO RUN", "demo-label"));
      const inputId = "player-answer";
      const input = node("input", { id: inputId, type: "text", autocomplete: "off", autocapitalize: "off", spellcheck: "false", placeholder: "Your answer", required: "", maxlength: "300", "aria-describedby": "answer-feedback", disabled: run.phase === "solved" || storageBlocked || updatePending });
      const feedback = node("div", { id: "answer-feedback", className: "feedback", role: "status", "aria-live": "polite" });
      const form = node("form", { onsubmit: event => {
        event.preventDefault();
        if (storageBlocked || dealing || updatePending) return;
        const result = changeRun(r => G.answerAndMove(r, card.id, input.value));
        if (result && !result.ok) {
          const newFeedback = $("answer-feedback");
          if (newFeedback) {
            newFeedback.textContent = result.message; newFeedback.classList.add("error");
            $("player-answer").value = input.value; $("player-answer").setAttribute("aria-invalid", "true"); $("player-answer").focus();
          } else setPlayerMessage(result.message, true);
        } else if (result) {
          if (!minimal) setPlayerMessage(result.message);
          if (!dealing) {
            if (result.outcome === "identified" && $("player-answer")) $("player-answer").focus();
            else if ($("move-one-space")) $("move-one-space").focus();
            else $("objective").focus();
          }
        }
      } }, node("label", { for: inputId, text: "Answer" }),
      node("div", { className: "answer-row" }, input, node("button", { type: "submit", text: "Submit answer", disabled: storageBlocked || run.phase === "solved" || updatePending })), feedback);
      controls.append(form);
      if (G.movementMode(run) === "manual") {
        const move = button("Move one space", () => { if (!dealing && !updatePending) changeRun(r => G.move(r, card.id), true); }, false, storageBlocked || run.phase !== "solved" || updatePending);
        move.id = "move-one-space";
        controls.append(move);
      }
      if (!minimal && run.hints.includes(card.id)) controls.append(node("div", { className: "hints" }, p("HOST-REVEALED HINT", "eyebrow"), p(card.hint)));
      else if (!minimal && card.hint) controls.append(p("Need a hint? Ask the host.", "muted small"));
    }
  }
  function markDirty() {
    dirty = true;
    const review = $("setup-reviewed");
    if (review) review.checked = draft.reviewed;
    const status = $("save-status");
    if (status) { status.textContent = "Unsaved changes"; status.classList.remove("error"); }
  }
  function field(labelText, value, onInput, options = {}) {
    const id = options.id || `field-${Math.random().toString(36).slice(2)}`;
    const tag = options.multiline ? "textarea" : "input";
    const input = node(tag, { id, ...(tag === "input" ? { type: options.type || "text" } : { rows: options.rows || 3 }), ...(options.min !== undefined ? { min: options.min, max: options.max } : {}) });
    input.value = value;
    input.addEventListener("input", () => { onInput(input.value); markDirty(); });
    return node("div", {}, node("label", { for: id, text: labelText }), input);
  }
  function checkbox(labelText, checked, onChange, id = null) {
    const input = node("input", { type: "checkbox", checked, ...(id ? { id } : {}) });
    input.addEventListener("change", () => { onChange(input.checked); markDirty(); });
    return node("label", { className: "check-label" }, input, node("span", { text: labelText }));
  }
  function selectField(labelText, value, choices, onChange) {
    const id = `field-${Math.random().toString(36).slice(2)}`;
    const select = node("select", { id }, Object.entries(choices).map(([key, label]) => node("option", { value: key, text: label })));
    select.value = value;
    select.addEventListener("change", () => { onChange(select.value); markDirty(); });
    return node("div", {}, node("label", { for: id, text: labelText }), select);
  }
  function hostFeedback(message, error = false) {
    const target = $("host-feedback");
    if (target) { target.textContent = message; target.classList.toggle("error", error); }
    else setPlayerMessage(message, error);
  }
  function saveDraft() {
    try {
      const config = G.validateConfig(draft);
      if (!persist({ ...state, config })) return false;
      draft = G.clone(config); dirty = false; armedMode = null;
      renderHost();
      $("save-status").textContent = "Saved locally. " + (state.run ? "These cards apply to the NEXT game; the current run is unchanged." : "Your board now matches this card order.");
      return true;
    } catch (error) { hostFeedback(error.message, true); return false; }
  }
  function loadEventPreset() {
    if (previewMode) { hostFeedback("This preview is fixed by its link. Edit your saved setup on the normal game page instead.", true); return; }
    if (dirty) {
      hostFeedback("Save your current edits first, or return to the board and explicitly discard them, before loading the event setup.", true);
      return;
    }
    confirm("Load MIMIR-opoly event setup?", "Download a backup of your saved setup, then replace the next-game setup with the authored five-card event. An existing run will NOT change. Reset it separately when you are ready.", () => {
      if (storageBlocked) return;
      download("mimir-previous-setup.json", JSON.stringify(state.config, null, 2));
      const config = G.clone(G.eventConfig);
      if (persist({ ...state, config })) {
        draft = G.clone(config); dirty = false; armedMode = null; renderHost();
        hostFeedback("MIMIR-OPOLY event setup loaded and saved. Review the host-only physical checklist. Any existing run is unchanged; reset it separately before starting this setup.");
      }
    });
  }
  function applyApprovedEventUpdate() {
    if (dirty) { hostFeedback("Save or explicitly discard unsaved edits first. The targeted update will preserve your saved custom fields.", true); return; }
    const targets = G.eventUpdateTargets(state);
    if (!targets.length) { hostFeedback("No known prior authored fields need updating. Custom answers and content were left unchanged."); return; }
    confirm("Apply the approved event update?", "Only the listed known prior event fields will change. No reset: time, position and railroad identification are preserved. If a card is already solved, enabling automatic movement performs its ONE pending move now when running, or when resumed. Completed cards stay completed.", () => {
      const update = G.applyEventUpdate(state);
      if (persist(update.state)) {
        draft = G.clone(state.config); dirty = false;
        if (previewMode && !state.run) armedMode = "demo";
        render();
        hostFeedback("Approved event changes applied. Custom fields and private notes were retained. Use the current private physical checklist for the revised print plan; no game reset was performed.");
      }
    });
  }
  function reopenCard(cardId) {
    renderHost();
    const details = document.querySelector(`[data-card-id="${cardId}"]`);
    if (details) details.open = true;
  }
  function openHost() {
    confirm("Enter host view?", "This screen contains answers. Turn the shared display away from players before continuing. Entering host view does NOT pause the clock.", () => {
      hostOpen = true; draft = G.clone(state.config); dirty = false;
      render(); $("host-view").focus();
    });
  }
  function closeHost() {
    const close = () => {
      hostOpen = false; draft = null; dirty = false;
      $("host-view").replaceChildren(); render(); $("objective").focus();
    };
    if (dirty) confirm("Leave without saving edits?", "Unsaved card edits will be discarded. The saved setup and current run will not change.", close);
    else close();
  }
  function approveStart(mode) {
    if (previewMode && mode !== "demo") { hostFeedback("Live play cannot be started inside an isolated preview.", true); return; }
    if (state.run) { hostFeedback("Reset the current run before starting another.", true); return; }
    if (!saveDraft()) return;
    try { G.start(state.config, mode); }
    catch (error) { hostFeedback(error.message, true); return; }
    armedMode = mode; hostOpen = false; draft = null; $("host-view").replaceChildren();
    render(); $("objective").focus();
  }
  function renderHost() {
    if (!hostOpen) return;
    if (!draft) draft = G.clone(state.config);
    const host = $("host-view");
    host.replaceChildren();
    host.append(node("div", { className: "host-heading" },
      node("div", {}, p("HOST ONLY / ANSWERS VISIBLE", "eyebrow"), node("h2", { text: "Your cards. In your order." })),
      button("Return to board", closeHost, true)),
      notice("Host mode is a convenience, not authentication. Anyone inspecting this client-side app or browser storage can find answers. Closing this view removes host answers and future card text from the player page."),
      node("div", { id: "host-feedback", className: "feedback", role: "status", "aria-live": "polite" }));
    const updates = G.eventUpdateTargets(state);
    if (updates.length) {
      const descriptions = {
        casino: "Casino accepted answers become 60, $60, +60 instead of the known old variants.",
        movement: "Ordinary correct answers advance automatically. Railroad identification still reveals in place.",
        intro: "Remove only the exact original keep-every-clue paragraph."
      };
      host.append(node("section", { className: "host-card event-loader" },
        node("h2", { text: "Approved event update" }),
        node("ul", {}, updates.flatMap(update => update.fields.map(field => node("li", { text: `${update.target}: ${descriptions[field]}` })))),
        p("Other answers, customized text, private notes and game progress stay as saved. A solved card has at most one pending move; the confirmation explains when that move occurs.", "small"),
        button("Apply latest event update", applyApprovedEventUpdate, false, storageBlocked)));
    }
    if (!previewMode) host.append(node("section", { className: "host-card event-loader" },
      node("h2", { text: "MIMIR-OPOLY event setup" }),
      p("Load the authored five-square game with automatic one-space movement, a two-part railroad, and an immediate final-answer win. Your current setup is backed up first; an active game keeps its original snapshot.", "small"),
      button("Load MIMIR-opoly event setup", loadEventPreset, false, storageBlocked)));
    const grid = node("div", { className: "host-grid" });
    const controls = node("section", { className: "host-card" }, node("h2", { text: "Game controls" }),
      node("p", { id: "host-clock", className: "clock", text: "" }));
    if (state.run) {
      const run = state.run;
      controls.append(p(`${run.mode.toUpperCase()} run · ${run.completed.length}/${run.config.cards.length} solved · ${run.phase}`, "small"));
      if (run.status === "running") controls.append(button("Pause game", () => changeRun(r => G.pause(r))));
      if (run.status === "paused") controls.append(button("Resume game", () => changeRun(r => G.resume(r))));
      if (run.status === "timeout") controls.append(notice("Add time first. The game will stay paused until you explicitly click Resume."));
      if (run.status !== "won") {
        const adjustInput = node("input", { id: "time-adjustment", type: "number", min: "-180", max: "180", step: "1", value: "5" });
        controls.append(node("label", { for: "time-adjustment", text: "Adjust remaining minutes (+ or -)" }),
          node("div", { className: "answer-row" }, adjustInput, button("Apply time", () => changeRun(r => G.adjust(r, Number(adjustInput.value))))));
        const card = G.currentCard(run);
        controls.append(node("div", { className: "host-task" },
          node("h3", { text: `Current: ${card.title || `Card ${run.index + 1}`}` }),
          card.reveal ? p(`Identification: ${card.reveal.answers.join(" / ")}. Reveals ${card.reveal.name}, ${card.reveal.price}. State: ${G.identified(run, card) ? "identified" : "not identified"}.`) : null,
          p(`Accepted: ${card.answers.join(" / ")}`),
          node("div", { className: "host-controls" },
            button("Reveal hint to players", () => changeRun(r => G.showHint(r, card.id)), true, run.config.presentation?.minimalCards || !card.hint || run.phase !== "drawn" || run.hints.includes(card.id) || !["running", "paused"].includes(run.status)),
            button("Award this card", () => confirm("Award the current card?", card.finishOnSolve ? "This completes the final card and wins immediately." : `This completes the whole card, including any identification step. ${G.movementMode(run) === "manual" ? "It unlocks one manual move." : "It moves and draws automatically."} The override is recorded.`, () => changeRun(r => G.answerAndMove(r, card.id, "", Date.now(), true))), true, run.status !== "running" || run.phase === "solved"))));
      }
      controls.append(node("div", { className: "host-controls" }, button("Reset run", () => confirm("Reset this run?", "This clears the timer and team progress, but keeps your saved card setup. Save any card edits before resetting.", () => {
        if (persist({ ...state, run: null })) { armedMode = previewMode ? "demo" : null; render(); }
      }), true)));
    } else {
      controls.append(p("Approve a start here, then click Begin on the board. The timer does not start yet.", "small"),
        node("div", { className: "host-controls" }, previewMode ? null : button("Approve live start", () => approveStart("live"), false, storageBlocked),
          button("Approve demo start", () => approveStart("demo"), true, storageBlocked)));
    }
    const issues = G.readiness(state.config);
    controls.append(node("h3", { text: "Saved setup readiness" }),
      issues.length ? node("ul", { className: "readiness-list" }, issues.map(issue => node("li", { text: issue }))) : p("Ready for live play.", "success-line"));
    grid.append(controls);
    if (previewMode) {
      host.append(controls, node("section", { className: "host-card" },
        node("h2", { text: "Fixed preview setup" }),
        p("This practice tab uses the setup named by its URL, not a browser's saved live game. Refresh keeps this tab's preview progress. A new tab starts its own practice run. Live data is never read or changed."),
        p("To preview custom edits, use Preview saved setup on the normal game's host screen. That link carries the exact edited cards. It contains answers and is for hosts only.", "small"),
        button("Export preview setup", () => download("mimir-preview-setup.json", JSON.stringify(state.config, null, 2)), true)));
      updateClock();
      return;
    }
    const settings = node("section", { className: "host-card" }, node("h2", { text: "Setup & backups" }),
      field("Game title", draft.title, value => { draft.title = value; }),
      field("Duration (minutes)", draft.durationMinutes, value => { draft.durationMinutes = Number(value); }, { type: "number", min: 1, max: 180 }),
      selectField("Movement after a correct answer", draft.movementMode || "manual", { manual: "Unlock one manual move", auto: "Automatic movement (legacy)" }, value => { draft.movementMode = value; draft.reviewed = false; }),
      field("Opening text (optional)", draft.intro, value => { draft.intro = value; }, { multiline: true }),
      checkbox("I have tested my actual cards and answers. All room doors will stay unlocked.", draft.reviewed, value => { draft.reviewed = value; }, "setup-reviewed"),
      node("div", { className: "host-controls" },
        button("Export saved setup", () => {
          if (dirty) { hostFeedback("Save your edits before exporting.", true); return; }
          download("wildwood-cards.json", JSON.stringify(state.config, null, 2));
          hostFeedback("Saved setup exported. This backup contains answers.");
        }, true),
        button("Import setup", () => $("import-file").click(), true)),
      p("Backups contain answers. Import replaces the next-game setup only; an active run keeps its original cards.", "small muted"));
    const file = node("input", { id: "import-file", type: "file", accept: ".json,application/json", hidden: "" });
    file.addEventListener("change", async () => {
      const selected = file.files[0];
      if (!selected) return;
      try {
        if (selected.size > 1000000) throw new Error("Setup file is too large (limit 1 MB).");
        const config = G.validateConfig(JSON.parse(await selected.text()));
        confirm("Import this setup?", `Replace the saved next-game setup with "${config.title}" (${config.cards.length} cards)? Unsaved edits will be discarded. The active run is unchanged.`, () => {
          if (persist({ ...state, config })) { draft = G.clone(config); dirty = false; armedMode = null; renderHost(); hostFeedback("Setup imported and saved locally."); }
        });
      } catch (error) { hostFeedback(`Import failed: ${error.message}`, true); }
      file.value = "";
    });
    settings.append(file);
    if (draft.presentation) {
      const presentation = draft.presentation;
      settings.append(node("details", {}, node("summary", { text: "Opening and ending screen copy" }),
        field("Opening heading", presentation.openingTitle, value => { presentation.openingTitle = value; }),
        field("Start button label", presentation.startLabel, value => { presentation.startLabel = value; }),
        field("Success heading", presentation.successTitle, value => { presentation.successTitle = value; }),
        field("Success text", presentation.successText, value => { presentation.successText = value; }, { multiline: true }),
        field("Timeout heading", presentation.timeoutTitle, value => { presentation.timeoutTitle = value; }),
        field("Timeout text", presentation.timeoutText, value => { presentation.timeoutText = value; }, { multiline: true }),
        selectField("Board tone", presentation.boardTone, { mint: "Pale mint", white: "White" }, value => { presentation.boardTone = value; }),
        checkbox("Use exact, minimal player cards (hide generic hints and helper copy)", presentation.minimalCards, value => { presentation.minimalCards = value; })));
    }
    grid.append(settings);
    host.append(grid);
    host.append(node("section", { className: "host-card" }, node("h2", { text: "Open the same setup in any browser" }),
      p("Preview links carry a fixed copy of the selected setup. They never load or change the receiving browser's live game. Links contain game answers (not private host notes); share only with hosts.", "small"),
      node("div", { className: "host-controls" },
        button("Preview saved setup", () => showPreviewLink(state.config), true),
        state.run ? button("Preview active game's setup", () => showPreviewLink(state.run.config), true) : null),
      node("div", { id: "preview-link-output" })));
    const editor = node("section", { className: "host-card" },
      node("div", { className: "host-heading" }, node("div", {}, node("h2", { text: "Edit cards" }), p("One card = one space. Dragging is not required: use Move up / Move down. Answers: one accepted variant per line.", "small")),
        node("div", { className: "button-row" }, button("Add card", () => {
          if (draft.cards.length >= 24) return;
          draft.cards.push({ id: `card-${crypto.randomUUID ? crypto.randomUUID() : Date.now()}`, title: "", prompt: "", answers: [], hint: "", demo: true, spaceType: "property", group: "auto" });
          draft.reviewed = false; markDirty(); renderHost();
          const last = host.querySelector(".card-editor:last-of-type"); if (last) { last.open = true; last.scrollIntoView({ block: "nearest" }); }
        }, true, draft.cards.length >= 24), button("Save cards & setup", saveDraft, false, storageBlocked))));
    if (state.run) editor.append(notice("A game exists. Edits are saved for the NEXT game only. Reset the current run to use changed cards; the running timer and card order are not altered."));
    editor.append(node("p", { id: "save-status", role: "status", className: "small", text: dirty ? "Unsaved changes" : `${draft.cards.length} cards saved locally.` }));
    editor.append(p("Space type changes the printed panel, deck and card appearance only. Chance and Community Chest still follow this same list; they never shuffle or move players randomly. Missing types in older setups display as Property.", "small muted"));
    draft.cards.forEach((card, index) => {
      const details = node("details", { className: "card-editor", "data-card-id": card.id }, node("summary", { text: `${index + 1}. ${card.title || card.boardLabel || "Untitled card"}${card.demo ? " [DEMO / PLACEHOLDER]" : ""}` }));
      const row = node("div", { className: "host-controls" },
        button("Move up", () => {
          [draft.cards[index - 1], draft.cards[index]] = [draft.cards[index], draft.cards[index - 1]];
          draft.reviewed = false; markDirty(); renderHost();
        }, true, index === 0),
        button("Move down", () => {
          [draft.cards[index + 1], draft.cards[index]] = [draft.cards[index], draft.cards[index + 1]];
          draft.reviewed = false; markDirty(); renderHost();
        }, true, index === draft.cards.length - 1),
        button("Remove card", () => confirm("Remove this card?", `Remove card ${index + 1}, "${card.title || "Untitled"}", from your editor? Save afterwards to update the next-game setup.`, () => {
          draft.cards.splice(index, 1); draft.reviewed = false; markDirty(); renderHost();
        }), true));
      const contentChanged = () => { draft.reviewed = false; };
      details.append(row,
        field("Title (optional)", card.title, value => { card.title = value; contentChanged(); }),
        field("Public board label (optional)", card.boardLabel || "", value => { card.boardLabel = value; contentChanged(); }),
        node("div", { className: "field-grid" },
          selectField("Space / card type", card.spaceType === undefined ? "property" : card.spaceType, G.SPACE_TYPES, value => { card.spaceType = value; contentChanged(); }),
          selectField("Property color group", card.group === undefined ? "auto" : card.group, G.groupChoices(card.group), value => { card.group = value; contentChanged(); })),
        p("Public board labels are visible before a card is drawn. Leave blank for generic type labels. For mystery properties, put the hidden name in the reveal fields below, not in the public label.", "small muted"),
        field("Puzzle / instructions shown when drawn", card.prompt, value => { card.prompt = value; contentChanged(); }, { multiline: true, rows: 5 }),
        field("Accepted answers (one per line)", card.answers.join("\n"), value => { card.answers = value.split(/\r?\n/).map(v => v.trim()).filter(Boolean); contentChanged(); }, { multiline: true, rows: 2 }),
        p("Words ignore case and surrounding/repeated spaces. Numeric codes stay strings: 007 is different from 7. Punctuation must match unless you add another variant.", "small muted"),
        field("Optional host-revealed hint", card.hint, value => { card.hint = value; contentChanged(); }, { multiline: true, rows: 2 }),
        field("Emphasize exact text (one phrase per line)", (card.emphasis || []).join("\n"), value => { card.emphasis = value.split(/\r?\n/).map(v => v.trim()).filter(Boolean); contentChanged(); }, { multiline: true, rows: 2 }),
        selectField("Card branding", card.branding || "none", { none: "None", microsoft: "Microsoft" }, value => { card.branding = value; contentChanged(); }),
        checkbox("Identify a property before solving this card", Boolean(card.reveal), checked => {
          if (checked) card.reveal = { kind: "identify-property", answers: [], name: "", boardLabel: "", price: "" };
          else delete card.reveal;
          contentChanged(); markDirty(); reopenCard(card.id);
        }),
        checkbox("Finish game immediately when this card is solved (last card only)", Boolean(card.finishOnSolve), checked => { card.finishOnSolve = checked; contentChanged(); }),
        checkbox("This is my actual card, not a demo or placeholder.", !card.demo, checked => { card.demo = !checked; contentChanged(); }));
      if (card.reveal) {
        details.append(node("div", { className: "host-task" },
          node("h3", { text: "Hidden property reveal" }),
          p("Identification reveals these fields without completing the square. The accepted answers above are the final purchase/completion proof. The displayed price is not automatically accepted.", "small"),
          field("Identification answers (one per line)", card.reveal.answers.join("\n"), value => { card.reveal.answers = value.split(/\r?\n/).map(v => v.trim()).filter(Boolean); contentChanged(); }, { multiline: true, rows: 2 }),
          field("Revealed property name", card.reveal.name, value => { card.reveal.name = value; contentChanged(); }),
          field("Revealed board label (optional)", card.reveal.boardLabel, value => { card.reveal.boardLabel = value; contentChanged(); }),
          field("Revealed price (display only)", card.reveal.price, value => { card.reveal.price = value; contentChanged(); })));
      }
      editor.append(details);
    });
    if (!draft.cards.length) editor.append(notice("No cards yet. Add a card, enter your instructions and answer, then save."));
    host.append(editor,
      ...(draft.hostNotes !== undefined ? [node("section", { className: "host-card" }, node("h2", { text: "Host-only physical setup notes" }),
        field("Private setup notes", draft.hostNotes, value => { draft.hostNotes = value; }, { multiline: true, rows: 16 }))] : []),
      node("section", { className: "host-card" }, node("h2", { text: "Use this locally" }),
        p("Open index.html in Edge or Chrome. Keep the same browser and address for the whole game. Refresh restores the timer, drawn card, accepted answer state, and team position. Use only one tab. The laptop must stay awake; a sleeping laptop still uses wall-clock time.", "small"),
        p("Your physical dice, deck, locks, recordings, and puzzle mechanics are yours. This app only displays your cards and checks the answer strings you enter. No puzzle content is generated.", "small"),
        p("There is no sound, internet dependency, login, or backend. Export your setup before clearing browser data or moving to a different address.", "small")));
    updateClock();
  }
  function render() {
    cancelPresentation();
    $("event-update-banner").hidden = hostOpen || !G.eventUpdateTargets(state).length;
    $("player-view").hidden = hostOpen;
    $("host-view").hidden = !hostOpen;
    $("host-open").hidden = hostOpen;
    if (hostOpen) {
      // Remove current player text while secrets are being edited; rebuild on return.
      $("objective").replaceChildren();
      $("answer-controls").replaceChildren();
      $("celebration").replaceChildren();
      renderHost();
    } else {
      $("host-view").replaceChildren();
      renderPlayer();
      presentCard();
      sizeBoardSpaces();
    }
    updateClock();
  }
  function showPreviewLink(config) {
    if (dirty) { hostFeedback("Save your edits first so the preview link includes them.", true); return; }
    try {
      const url = P.makeLink(config, location.href);
      const input = node("textarea", { id: "generated-preview-url", rows: "3", readonly: "" });
      input.value = url;
      $("preview-link-output").replaceChildren(
        node("label", { for: "generated-preview-url", text: "Host-only preview link (contains answers)" }), input,
        node("a", { href: url, target: "_blank", rel: "noopener noreferrer", text: "Open isolated preview", className: "preview-open-link" }));
    } catch (error) { hostFeedback(error.message, true); }
  }
  $("preview-banner").hidden = !previewMode;
  $("restart-preview").onclick = () => confirm("Restart this preview?", "Reset only this practice tab to GO with a stopped timer. Your live setup, run and remaining time are untouched.", () => {
    if (previewMode && persist({ ...state, run: null })) {
      armedMode = "demo"; hostOpen = false; draft = null; dirty = false; render();
    }
  });
  $("host-open").onclick = openHost;
  $("event-update-host").onclick = openHost;
  new ResizeObserver(() => requestAnimationFrame(sizeBoardSpaces)).observe($("board"));
  matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", event => {
    if (event.matches && dealing) { cancelPresentation(); presentCard(); }
  });
  window.addEventListener("beforeunload", event => {
    if (dirty) { event.preventDefault(); event.returnValue = ""; }
  });
  window.addEventListener("storage", event => {
    if (event.storageArea !== storage()) return;
    if (event.key === STORAGE_KEY || event.key === null) storageError("Saved data changed in another tab. Close the other tab, then retry here.");
  });
  setInterval(() => {
    if (storageBlocked) return;
    if (state.run && state.run.status === "running" && G.remaining(state.run) === 0) changeRun(r => G.tick(r));
    updateClock();
  }, 250);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && !storageBlocked && state.run && G.remaining(state.run) === 0 && state.run.status === "running") changeRun(r => G.tick(r));
    updateClock();
  });
  load();
  render();
})();
