(() => {
    "use strict";

    // =========================================================
    // 1. 汎用ユーティリティ
    // =========================================================

    function isPlainObject(value) {
      return value !== null && typeof value === "object" && !Array.isArray(value);
    }

    function cloneJson(value) {
      return JSON.parse(JSON.stringify(value));
    }

    function parseJsonSafely(text) {
      try {
        return { ok: true, data: JSON.parse(text) };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    }

    function isMeaningfulId(id) {
      return /^[a-z][a-z0-9_-]*$/.test(id);
    }

    function toArrayText(text) {
      if (typeof text === "string") return [text];
      if (Array.isArray(text)) return text.filter((line) => typeof line === "string");
      return [];
    }

    function getNestedValue(target, path) {
      const parts = path.split(".");
      let current = target;

      for (const part of parts) {
        if (current === null || current === undefined || typeof current !== "object" || !(part in current)) {
          return undefined;
        }
        current = current[part];
      }

      return current;
    }

    function ensureNestedParent(target, path) {
      const parts = path.split(".");
      let current = target;

      for (let i = 0; i < parts.length - 1; i += 1) {
        const part = parts[i];
        if (
          current[part] === null ||
          current[part] === undefined ||
          typeof current[part] !== "object" ||
          Array.isArray(current[part])
        ) {
          current[part] = {};
        }
        current = current[part];
      }

      return {
        parent: current,
        key: parts[parts.length - 1]
      };
    }

    function setNestedValue(target, path, value) {
      const ref = ensureNestedParent(target, path);
      ref.parent[ref.key] = value;
    }

    function addNestedNumber(target, path, delta) {
      const current = getNestedValue(target, path);
      const base = typeof current === "number" ? current : 0;
      setNestedValue(target, path, base + delta);
    }

    function addMinutesToTime(timeObj, minutes) {
      if (!isPlainObject(timeObj) || typeof minutes !== "number") return;

      const date = new Date(
        typeof timeObj.year === "number" ? timeObj.year : 2000,
        typeof timeObj.month === "number" ? timeObj.month - 1 : 0,
        typeof timeObj.day === "number" ? timeObj.day : 1,
        typeof timeObj.hour === "number" ? timeObj.hour : 0,
        typeof timeObj.minute === "number" ? timeObj.minute : 0
      );

      date.setMinutes(date.getMinutes() + minutes);

      timeObj.year = date.getFullYear();
      timeObj.month = date.getMonth() + 1;
      timeObj.day = date.getDate();
      timeObj.hour = date.getHours();
      timeObj.minute = date.getMinutes();
      timeObj.turn = typeof timeObj.turn === "number" ? timeObj.turn + 1 : 1;
    }

    function formatTime(timeObj) {
      if (!isPlainObject(timeObj)) return "-";

      const pad = (n) => String(n).padStart(2, "0");
      const hasFullDate =
        ["year", "month", "day", "hour", "minute"].every((key) => typeof timeObj[key] === "number");

      if (!hasFullDate) return "-";

      return `${timeObj.year}/${pad(timeObj.month)}/${pad(timeObj.day)} ${pad(timeObj.hour)}:${pad(timeObj.minute)} (T${typeof timeObj.turn === "number" ? timeObj.turn : 0})`;
    }

    async function copyTextToClipboard(text) {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return;
      }

      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";

      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();

      const ok = document.execCommand("copy");
      document.body.removeChild(textarea);

      if (!ok) {
        throw new Error("この環境ではクリップボードへのコピーが許可されていません。");
      }
    }

    async function readTextFromClipboard() {
      if (navigator.clipboard && window.isSecureContext) {
        return navigator.clipboard.readText();
      }
      throw new Error("この環境ではクリップボードの読み取りが許可されていません。");
    }

    // =========================================================
    // 2. 定数・UI参照・静的データ
    // =========================================================

    const MESSAGE_WINDOW_LIMIT = 3;

    const ui = {
      setup: {
        promptModeSelect: document.getElementById("promptModeSelect"),
        sampleSelect: document.getElementById("sampleSelect"),
        scriptInput: document.getElementById("scriptInput"),
        jsonFileInput: document.getElementById("jsonFileInput"),
        openFileButton: document.getElementById("openFileButton"),
        copyScriptButton: document.getElementById("copyScriptButton"),
        loadExampleButton: document.getElementById("loadExampleButton"),
        copyPromptButton: document.getElementById("copyPromptButton"),
        pasteScriptButton: document.getElementById("pasteScriptButton"),
        loadScriptButton: document.getElementById("loadScriptButton"),
        restartButton: document.getElementById("restartButton"),
        copyStateButton: document.getElementById("copyStateButton"),
        copyStatusButton: document.getElementById("copyStatusButton"),
        copyContinuationButton: document.getElementById("copyContinuationButton")
      },
      aiAssist: {
        card: document.getElementById("aiAssistCard"),
        status: document.getElementById("aiAssistStatus"),
        fragmentInput: document.getElementById("fragmentInput"),
        copyPromptWithFragmentButton: document.getElementById("copyPromptWithFragmentButton"),
        copyFragmentButton: document.getElementById("copyFragmentButton"),
        refreshFragmentButton: document.getElementById("refreshFragmentButton"),
        pasteFragmentButton: document.getElementById("pasteFragmentButton"),
        mergeFragmentButton: document.getElementById("mergeFragmentButton"),
        saveFragmentButton: document.getElementById("saveFragmentButton"),
        loadFragmentFileButton: document.getElementById("loadFragmentFileButton"),
        fragmentFileInput: document.getElementById("fragmentFileInput")
      },
      editor: {
        modeSelect: document.getElementById("editorModeSelect"),
        panel: document.getElementById("editorPanel"),
        categorySelect: document.getElementById("editorCategorySelect"),
        itemSelect: document.getElementById("editorItemSelect"),
        newButton: document.getElementById("editorNewButton"),
        duplicateButton: document.getElementById("editorDuplicateButton"),
        deleteButton: document.getElementById("editorDeleteButton"),
        applyButton: document.getElementById("editorApplyButton"),
        rebuildButton: document.getElementById("editorRebuildButton"),
        saveIntegratedJsonButton: document.getElementById("saveIntegratedJsonButton"),
        status: document.getElementById("editorStatus"),
        form: document.getElementById("editorForm")
      },
      stateTools: {
        toggleRawStateButton: document.getElementById("toggleRawStateButton"),
        rawStateArea: document.getElementById("rawStateArea")
      },
      status: {
        globalStatus: document.getElementById("globalStatus")
      },
      header: {
        gameTitle: document.getElementById("gameTitle"),
        currentEventIdText: document.getElementById("currentEventIdText"),
        currentSpotIdText: document.getElementById("currentSpotIdText"),
        currentTimeText: document.getElementById("currentTimeText"),
        stepText: document.getElementById("stepText"),
        healthText: document.getElementById("healthText")
      },
      state: {
        itemsText: document.getElementById("itemsText"),
        statePreview: document.getElementById("statePreview")
      },
      event: {
        eventTitle: document.getElementById("eventTitle"),
        speakerLine: document.getElementById("speakerLine"),
        textArea: document.getElementById("textArea"),
        choiceList: document.getElementById("choiceList")
      },
      log: {
        logList: document.getElementById("logList")
      }
    };

    const game = {
      loadedSource: null,
      runtime: null,
      state: null,
      currentEventId: "",
      stepCount: 0,
      logEntries: [],
      messageHistory: [],
      isRawStateVisible: false,
      editorDraft: null,
      editorSelection: {
        category: "areas",
        itemId: ""
      }
    };

    const SAMPLE_SCENARIO = window.HOLMES_SAMPLE_SCENARIO || {};
    const SAMPLE_REGISTRY = Array.isArray(window.HOLMES_SAMPLE_REGISTRY) ? window.HOLMES_SAMPLE_REGISTRY : [];
    const PROMPT_SAMPLE_JSON = window.HOLMES_PROMPT_SAMPLE_JSON || JSON.stringify(SAMPLE_SCENARIO, null, 2);
    const GENERIC_PROMPT = window.HOLMES_PROMPTS?.generic || '';
    const SHINDO_PROMPT = window.HOLMES_PROMPTS?.shindo || '';
    const EDITOR_CATEGORIES = [
      { value: "areas", label: "Areas" },
      { value: "dungeons", label: "Dungeons" },
      { value: "spots", label: "Spots" },
      { value: "characters", label: "Characters" },
      { value: "items", label: "Items" },
      { value: "events", label: "Events" },
      { value: "scenarios", label: "Scenarios" },
      { value: "quests", label: "Quests" },
      { value: "initial_state", label: "Initial State" }
    ];

    function createEmptyScriptTemplate() {
      return normalizeScriptStructure({
        title: "Untitled",
        version: "1.0.0",
        definitions: {
          characters: {},
          items: {}
        },
        world: {
          areas: {},
          dungeons: {},
          spots: {}
        },
        events: {},
        scenarios: {},
        quests: {},
        initial_state: {
          player_character_id: "",
          active_scenario_id: "",
          active_quest_ids: [],
          primary_quest_id: "",
          quest_states: {},
          current_quest_id: "",
          current_event_id: "",
          current_spot_id: "",
          time: {},
          flags: [],
          unique: {},
          characters: {},
          spot_states: {}
        }
      });
    }

    function ensureEditorDraft() {
      if (!isPlainObject(game.editorDraft)) {
        game.editorDraft = createEmptyScriptTemplate();
      }

      const draft = game.editorDraft;

      if (typeof draft.title !== "string") draft.title = "Untitled";
      if (typeof draft.version !== "string") draft.version = "1.0.0";
      if (!isPlainObject(draft.definitions)) draft.definitions = {};
      if (!isPlainObject(draft.definitions.characters)) draft.definitions.characters = {};
      if (!isPlainObject(draft.definitions.items)) draft.definitions.items = {};
      if (!isPlainObject(draft.world)) draft.world = {};
      if (!isPlainObject(draft.world.areas)) draft.world.areas = {};
      if (!isPlainObject(draft.world.dungeons)) draft.world.dungeons = {};
      if (!isPlainObject(draft.world.spots)) draft.world.spots = {};
      if (!isPlainObject(draft.events)) draft.events = {};
      if (!isPlainObject(draft.scenarios)) draft.scenarios = {};
      if (!isPlainObject(draft.quests)) draft.quests = {};
      if (!isPlainObject(draft.initial_state)) draft.initial_state = {};
      if (!Array.isArray(draft.initial_state.flags)) draft.initial_state.flags = [];

      return draft;
    }

    function getEditorCollection(category) {
      const draft = ensureEditorDraft();

      switch (category) {
        case "areas":
          return draft.world.areas;
        case "dungeons":
          return draft.world.dungeons;
        case "spots":
          return draft.world.spots;
        case "characters":
          return draft.definitions.characters;
        case "items":
          return draft.definitions.items;
        case "events":
          return draft.events;
        case "scenarios":
          return draft.scenarios;
        case "quests":
          return draft.quests;
        case "initial_state":
          return draft.initial_state;
        default:
          return {};
      }
    }

    function parseLineList(text) {
      if (typeof text !== "string") return [];
      return text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    }

    function parseCommaList(text) {
      if (typeof text !== "string") return [];
      return text
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
    }

    function parseJsonField(text, fallback) {
      if (typeof text !== "string" || !text.trim()) return cloneJson(fallback);

      const parsed = parseJsonSafely(text);
      if (!parsed.ok) {
        throw new Error(parsed.error);
      }

      return parsed.data;
    }

    function buildEditorStatus(type, message) {
      if (!ui.editor.status) return;
      ui.editor.status.className = `status ${type}`.trim();
      ui.editor.status.textContent = message;
    }

    function buildAiAssistStatus(type, message) {
      if (!ui.aiAssist.status) return;
      ui.aiAssist.status.className = `status ${type}`.trim();
      ui.aiAssist.status.textContent = message;
    }

    function getCurrentIntegratedJson() {
      if (isPlainObject(game.editorDraft)) {
        return buildIntegratedEditorJson();
      }

      const parsed = parseJsonSafely(ui.setup.scriptInput.value.trim());
      if (parsed.ok) {
        return normalizeScriptStructure(parsed.data);
      }

      return createEmptyScriptTemplate();
    }

    function getCurrentPromptSampleJson() {
      return JSON.stringify(getCurrentIntegratedJson(), null, 2);
    }

    function getPromptForMode(mode) {
      if (mode === "generic") return GENERIC_PROMPT;
      if (mode === "shindo") return SHINDO_PROMPT;

      const editorPromptMap = {
        editor_area: { label: "areas", rootKey: "areas", category: "areas" },
        editor_dungeon: { label: "dungeons", rootKey: "dungeons", category: "dungeons" },
        editor_spot: { label: "spots", rootKey: "spots", category: "spots" },
        editor_character: { label: "characters", rootKey: "characters", category: "characters" },
        editor_item: { label: "items", rootKey: "items", category: "items" },
        editor_event: { label: "events", rootKey: "events", category: "events" },
        editor_scenario: { label: "scenarios", rootKey: "scenarios", category: "scenarios" },
        editor_quest: { label: "quests", rootKey: "quests", category: "quests" }
      };

      if (mode === "editor_merge_assistant") {
        return [
          "以下の統合JSONに対して追加・修正したい差分を、カテゴリJSONだけで返してください。",
          "完全JSONは返さず、対象カテゴリだけの最小カテゴリJSONにしてください。",
          "使ってよい形式は areas / dungeons / spots / characters / items / events / scenarios / quests / scenario_id+scenario / quest_id+quest / initial_state_fragment です。",
          "出力はコードブロック1つ、JSONのみ。説明文は禁止です。",
          "",
          "【現在の統合JSON】",
          "```json",
          getCurrentPromptSampleJson(),
          "```"
        ].join("\n");
      }

      const config = editorPromptMap[mode];
      if (!config) return GENERIC_PROMPT;

      const exampleJson = (() => {
        const integrated = getCurrentIntegratedJson();
        const dataByCategory = {
          areas: integrated.world?.areas || {},
          dungeons: integrated.world?.dungeons || {},
          spots: integrated.world?.spots || {},
          characters: integrated.definitions?.characters || {},
          items: integrated.definitions?.items || {},
          events: integrated.events || {},
          scenarios: integrated.scenarios || {},
          quests: integrated.quests || {}
        };
        return JSON.stringify({ [config.rootKey]: dataByCategory[config.category] || {} }, null, 2);
      })();

      return [
        `以下を厳守して、${config.label} 用のカテゴリJSONを1つ作成してください。`,
        "",
        "【目的】",
        `- 統合JSON全体ではなく ${config.rootKey} だけを返すこと`,
        "- 既存データに後からマージできる、安全なカテゴリJSONにすること",
        "- 出力は純粋なJSONのみとし、説明文を混ぜないこと",
        "",
        "【必須ルール】",
        `- top-level は ${config.rootKey} のみを基本とすること`,
        `- 形式は {"${config.rootKey}": {...}} を基本とすること`,
        "- 既存IDを上書きする場合も、必要な項目を省略しすぎないこと",
        "- 新仕様に従い、event本体は top-level events に置くこと",
        "- scenario / quest は event_ids や start_event_id で event を参照すること",
        "- JSON以外の説明文・注釈・前置きは禁止",
        "",
        "【出力形式】",
        "- コードブロックは1つのみ",
        "- コードブロックの中身は純粋なJSONのみ",
        "",
        "【現在の参考カテゴリJSON】",
        "```json",
        exampleJson,
        "```",
        "",
        "【現在の統合JSON】",
        "```json",
        getCurrentPromptSampleJson(),
        "```"
      ].join("\n");
    }

    function stripSampleJsonSection(prompt) {
      const marker = "【見本JSON】";
      const index = prompt.indexOf(marker);
      if (index === -1) return prompt;
      return prompt.slice(0, index).trimEnd();
    }

    function deepMergeObjects(baseValue, patchValue) {
      if (Array.isArray(patchValue)) {
        return cloneJson(patchValue);
      }

      if (!isPlainObject(patchValue)) {
        return patchValue;
      }

      const result = isPlainObject(baseValue) ? cloneJson(baseValue) : {};
      Object.entries(patchValue).forEach(([key, value]) => {
        if (isPlainObject(value) && isPlainObject(result[key])) {
          result[key] = deepMergeObjects(result[key], value);
        } else {
          result[key] = cloneJson(value);
        }
      });
      return result;
    }

    function classifyJsonPayload(data) {
      if (!isPlainObject(data)) {
        return { kind: "invalid", reason: "JSON全体はオブジェクトである必要があります。" };
      }

      const fullKeys = ["title", "version", "definitions", "world", "events", "initial_state"];
      const fragmentKeys = [
        "areas",
        "dungeons",
        "spots",
        "characters",
        "items",
        "events",
        "scenarios",
        "quests",
        "scenario_id",
        "scenario",
        "quest_id",
        "quest",
        "initial_state_fragment"
      ];

      const hasFullStructure =
        (typeof data.title === "string" || typeof data.version === "string") &&
        (isPlainObject(data.definitions) || isPlainObject(data.world) || isPlainObject(data.initial_state));

      if (hasFullStructure) {
        return { kind: "full" };
      }

      const keys = Object.keys(data);
      if (keys.length === 0) {
        return { kind: "invalid", reason: "空のJSONは取り込めません。" };
      }

      if (keys.every((key) => fragmentKeys.includes(key))) {
        return { kind: "fragment" };
      }

      return { kind: "invalid", reason: "完全JSONでもカテゴリJSONでもない形式です。" };
    }

    function mergeCollectionFragment(targetCollection, fragmentCollection, label, report) {
      Object.entries(fragmentCollection).forEach(([itemId, itemValue]) => {
        const existed = isPlainObject(targetCollection[itemId]);
        targetCollection[itemId] = deepMergeObjects(targetCollection[itemId], itemValue);
        report.lines.push(`${label}.${itemId}: ${existed ? "上書き" : "追加"}`);
        if (existed) {
          report.updated += 1;
        } else {
          report.created += 1;
        }
      });
    }

    function mergeFragmentIntoDraft(fragment) {
      const draft = ensureEditorDraft();
      const report = {
        created: 0,
        updated: 0,
        lines: []
      };

      if (isPlainObject(fragment.areas)) {
        mergeCollectionFragment(draft.world.areas, fragment.areas, "areas", report);
      }
      if (isPlainObject(fragment.dungeons)) {
        mergeCollectionFragment(draft.world.dungeons, fragment.dungeons, "dungeons", report);
      }
      if (isPlainObject(fragment.spots)) {
        mergeCollectionFragment(draft.world.spots, fragment.spots, "spots", report);
      }
      if (isPlainObject(fragment.characters)) {
        mergeCollectionFragment(draft.definitions.characters, fragment.characters, "characters", report);
      }
      if (isPlainObject(fragment.items)) {
        mergeCollectionFragment(draft.definitions.items, fragment.items, "items", report);
      }
      if (isPlainObject(fragment.events)) {
        mergeCollectionFragment(draft.events, fragment.events, "events", report);
      }
      if (isPlainObject(fragment.scenarios)) {
        mergeCollectionFragment(draft.scenarios, fragment.scenarios, "scenarios", report);
      }
      if (isPlainObject(fragment.quests)) {
        mergeCollectionFragment(draft.quests, fragment.quests, "quests", report);
      }
      if (typeof fragment.scenario_id === "string" && isPlainObject(fragment.scenario)) {
        const scenarioId = fragment.scenario_id.trim();
        const existed = isPlainObject(draft.scenarios[scenarioId]);
        draft.scenarios[scenarioId] = deepMergeObjects(draft.scenarios[scenarioId], fragment.scenario);
        report.lines.push(`scenarios.${scenarioId}: ${existed ? "上書き" : "追加"}`);
        existed ? report.updated += 1 : report.created += 1;
      }
      if (typeof fragment.quest_id === "string" && isPlainObject(fragment.quest)) {
        const questId = fragment.quest_id.trim();
        const existed = isPlainObject(draft.quests[questId]);
        draft.quests[questId] = deepMergeObjects(draft.quests[questId], fragment.quest);
        report.lines.push(`quests.${questId}: ${existed ? "上書き" : "追加"}`);
        existed ? report.updated += 1 : report.created += 1;
      }
      if (isPlainObject(fragment.initial_state_fragment)) {
        draft.initial_state = deepMergeObjects(draft.initial_state, fragment.initial_state_fragment);
        report.lines.push("initial_state_fragment: 上書き");
        report.updated += 1;
      }

      syncDraftInitialStateReferences();
      game.editorDraft = normalizeScriptStructure(draft);
      return report;
    }

    function buildFragmentPayloadFromSelection() {
      ensureEditorDraft();
      const category = game.editorSelection.category;
      const itemId = game.editorSelection.itemId;

      if (category === "initial_state") {
        return {
          filename: "initial_state.category.json",
          payload: {
            initial_state_fragment: {
              player_character_id: game.editorDraft.initial_state.player_character_id || "",
              active_scenario_id: game.editorDraft.initial_state.active_scenario_id || "",
              current_event_id: game.editorDraft.initial_state.current_event_id || "",
              current_spot_id: game.editorDraft.initial_state.current_spot_id || "",
              flags: Array.isArray(game.editorDraft.initial_state.flags) ? cloneJson(game.editorDraft.initial_state.flags) : []
            }
          }
        };
      }

      const collection = getEditorCollection(category);
      const rootMap = {
        areas: "areas",
        dungeons: "dungeons",
        spots: "spots",
        characters: "characters",
        items: "items",
        events: "events",
        scenarios: "scenarios",
        quests: "quests"
      };
      const rootKey = rootMap[category];
      if (!rootKey) {
        throw new Error("このカテゴリはカテゴリJSONダウンロードに対応していません。");
      }

      if (itemId && isPlainObject(collection[itemId])) {
        if (category === "scenarios") {
          return {
            filename: `scenario.${itemId}.category.json`,
            payload: { scenario_id: itemId, scenario: cloneJson(collection[itemId]) }
          };
        }
        if (category === "quests") {
          return {
            filename: `quest.${itemId}.category.json`,
            payload: { quest_id: itemId, quest: cloneJson(collection[itemId]) }
          };
        }
        return {
          filename: `${category}.${itemId}.category.json`,
          payload: { [rootKey]: { [itemId]: cloneJson(collection[itemId]) } }
        };
      }

      return {
        filename: `${category}.category.json`,
        payload: { [rootKey]: cloneJson(collection) }
      };
    }

    function refreshFragmentWorkspace() {
      try {
        if (game.editorSelection.itemId) {
          applyEditorFormChanges();
        }
      } catch (error) {
        buildAiAssistStatus("warn", "現在のフォームに未解決エラーがあるため、直前のカテゴリJSONを表示します。");
      }

      const fragment = buildFragmentPayloadFromSelection();
      ui.aiAssist.fragmentInput.value = JSON.stringify(fragment.payload, null, 2);
      return fragment;
    }

    function getFragmentWorkspaceText() {
      const text = String(ui.aiAssist.fragmentInput.value || "").trim();
      if (text) return text;
      return JSON.stringify(buildFragmentPayloadFromSelection().payload, null, 2);
    }

    function getEditorItemEntries(category) {
      if (category === "initial_state") {
        return [
          {
            id: "initial_state",
            label: "initial_state"
          }
        ];
      }

      const collection = getEditorCollection(category);

      return Object.entries(collection)
        .filter(([, value]) => isPlainObject(value))
        .map(([id, value]) => {
          const name = typeof value.name === "string" && value.name.trim()
            ? value.name.trim()
            : (typeof value.title === "string" && value.title.trim() ? value.title.trim() : "");
          return {
            id,
            label: name ? `${id} | ${name}` : id
          };
        })
        .sort((a, b) => a.label.localeCompare(b.label, "ja"));
    }

    function getDefaultEditorItem(category, itemId) {
      const defaults = {
        areas: { name: "", description: "" },
        dungeons: { name: "", area_id: "", type: "", description: "" },
        spots: { name: "", area_id: "", dungeon_id: "", spot_type: "", connections: [], description: "" },
        characters: { name: "", tags: [], description: "", base_stats: {} },
        items: { name: "", item_type: "", tags: [], description: "", stackable: false, consumable: false },
        events: {
          title: "",
          event_type: "spot_event",
          spot_id: "",
          participants: [],
          text: [],
          conditional_texts: [],
          actions: [],
          choices: []
        },
        scenarios: {
          title: "",
          start_event_id: "",
          game_over_event_id: "",
          event_ids: [],
          movement_rules: {},
          overlay: {}
        },
        quests: {
          title: "",
          description: "",
          related_scenario_ids: [],
          start_event_id: "",
          event_ids: [],
          restrictions: {},
          completion: {}
        }
      };

      if (category === "initial_state") {
        return {
          player_character_id: "",
          active_scenario_id: "",
          active_quest_ids: [],
          primary_quest_id: "",
          current_event_id: "",
          current_spot_id: "",
          time: {},
          flags: []
        };
      }

      const base = defaults[category] || {};
      return cloneJson(base);
    }

    function makeUniqueEditorId(category) {
      const collection = getEditorCollection(category);
      const base = {
        areas: "new_area",
        dungeons: "new_dungeon",
        spots: "new_spot",
        characters: "new_character",
        items: "new_item",
        events: "new_event",
        scenarios: "new_scenario",
        quests: "new_quest"
      }[category] || "new_item";

      if (!collection[base]) return base;

      let index = 2;
      while (collection[`${base}_${index}`]) {
        index += 1;
      }
      return `${base}_${index}`;
    }

    function makeDuplicatedEditorId(category, sourceId) {
      const collection = getEditorCollection(category);
      const base = `${sourceId}_copy`;
      if (!collection[base]) return base;

      let index = 2;
      while (collection[`${base}_${index}`]) {
        index += 1;
      }
      return `${base}_${index}`;
    }

    function loadEditorDraft(source) {
      game.editorDraft = normalizeScriptStructure(cloneJson(source));
      ensureEditorDraft();

      const entries = getEditorItemEntries(game.editorSelection.category);
      game.editorSelection.itemId = entries[0]?.id || (game.editorSelection.category === "initial_state" ? "initial_state" : "");
      renderEditor();
      refreshFragmentWorkspace();
    }

    function syncDraftInitialStateReferences() {
      const draft = ensureEditorDraft();
      const playerId = typeof draft.initial_state.player_character_id === "string"
        ? draft.initial_state.player_character_id.trim()
        : "";
      const currentSpotId = typeof draft.initial_state.current_spot_id === "string"
        ? draft.initial_state.current_spot_id.trim()
        : "";

      if (playerId && isPlainObject(draft.initial_state.characters?.[playerId]) && currentSpotId) {
        draft.initial_state.characters[playerId].spot_id = currentSpotId;
      }
    }

    function buildIntegratedEditorJson() {
      ensureEditorDraft();
      syncDraftInitialStateReferences();
      return normalizeScriptStructure(cloneJson(game.editorDraft));
    }

    function createEditorField(label, name, value, options = {}) {
      const wrapper = document.createElement("label");
      wrapper.className = "editor-field";

      const title = document.createElement("span");
      title.className = "label";
      title.textContent = label;
      wrapper.appendChild(title);

      let control;
      if (options.type === "select") {
        control = document.createElement("select");
        const emptyOption = document.createElement("option");
        emptyOption.value = "";
        emptyOption.textContent = options.emptyLabel || "-";
        control.appendChild(emptyOption);

        (options.options || []).forEach((entry) => {
          const option = document.createElement("option");
          option.value = entry.value;
          option.textContent = entry.label;
          control.appendChild(option);
        });
        control.value = value ?? "";
      } else if (options.type === "textarea") {
        control = document.createElement("textarea");
        if (options.large) {
          control.classList.add("editor-text-lg");
        }
      } else if (options.type === "checkbox") {
        control = document.createElement("input");
        control.type = "checkbox";
        control.checked = Boolean(value);
      } else {
        control = document.createElement("input");
        control.type = options.type || "text";
        control.value = value ?? "";
      }

      control.dataset.field = name;
      if (options.placeholder) {
        control.placeholder = options.placeholder;
      }
      if (options.type === "textarea") {
        control.value = value ?? "";
      }

      wrapper.appendChild(control);

      if (options.hint) {
        const hint = document.createElement("div");
        hint.className = "editor-hint";
        hint.textContent = options.hint;
        wrapper.appendChild(hint);
      }

      return wrapper;
    }

    function buildReferenceOptions(collection, titleField = "title") {
      return Object.entries(collection || {})
        .filter(([, value]) => isPlainObject(value))
        .map(([id, value]) => {
          const title = typeof value[titleField] === "string" && value[titleField].trim()
            ? value[titleField].trim()
            : (typeof value.name === "string" && value.name.trim() ? value.name.trim() : "");
          return {
            value: id,
            label: title ? `${id} | ${title}` : id
          };
        })
        .sort((a, b) => a.label.localeCompare(b.label, "ja"));
    }

    function renderEditorForm(category, itemId) {
      ui.editor.form.innerHTML = "";

      if (category === "initial_state") {
        const state = ensureEditorDraft().initial_state;
        const draft = ensureEditorDraft();
        const characterOptions = buildReferenceOptions(draft.definitions.characters, "name");
        const scenarioOptions = buildReferenceOptions(draft.scenarios, "title");
        const questOptions = buildReferenceOptions(draft.quests, "title");
        const eventOptions = buildReferenceOptions(draft.events, "title");
        const grid = document.createElement("div");
        grid.className = "editor-grid";
        grid.appendChild(createEditorField("player_character_id", "player_character_id", state.player_character_id || "", {
          type: "select",
          options: characterOptions
        }));
        grid.appendChild(createEditorField("active_scenario_id", "active_scenario_id", state.active_scenario_id || "", {
          type: "select",
          options: scenarioOptions
        }));
        grid.appendChild(createEditorField("active_quest_ids", "active_quest_ids", Array.isArray(state.active_quest_ids) ? state.active_quest_ids.join(", ") : "", {
          hint: "カンマ区切り"
        }));
        grid.appendChild(createEditorField("primary_quest_id", "primary_quest_id", state.primary_quest_id || "", {
          type: "select",
          options: questOptions
        }));
        grid.appendChild(createEditorField("current_event_id", "current_event_id", state.current_event_id || "", {
          type: "select",
          options: eventOptions
        }));
        grid.appendChild(createEditorField("current_spot_id", "current_spot_id", state.current_spot_id || ""));
        ui.editor.form.appendChild(grid);
        ui.editor.form.appendChild(
          createEditorField("time", "time", JSON.stringify(state.time || {}, null, 2), {
            type: "textarea",
            hint: "JSON形式"
          })
        );
        ui.editor.form.appendChild(
          createEditorField("flags", "flags", (state.flags || []).join("\n"), {
            type: "textarea",
            hint: "1行1フラグ"
          })
        );
        return;
      }

      const collection = getEditorCollection(category);
      const item = isPlainObject(collection[itemId]) ? collection[itemId] : null;

      if (!item) {
        const empty = document.createElement("div");
        empty.className = "editor-empty";
        empty.textContent = "このカテゴリにはまだ項目がありません。新規作成してください。";
        ui.editor.form.appendChild(empty);
        return;
      }

      const grid = document.createElement("div");
      grid.className = "editor-grid";
      grid.appendChild(createEditorField("id", "__id", itemId));

      if (category === "areas") {
        grid.appendChild(createEditorField("name", "name", item.name || ""));
        ui.editor.form.appendChild(grid);
        ui.editor.form.appendChild(createEditorField("description", "description", item.description || "", { type: "textarea" }));
        return;
      }

      if (category === "dungeons") {
        grid.appendChild(createEditorField("name", "name", item.name || ""));
        grid.appendChild(createEditorField("area_id", "area_id", item.area_id || ""));
        grid.appendChild(createEditorField("type", "type", item.type || ""));
        ui.editor.form.appendChild(grid);
        ui.editor.form.appendChild(createEditorField("description", "description", item.description || "", { type: "textarea" }));
        return;
      }

      if (category === "spots") {
        grid.appendChild(createEditorField("name", "name", item.name || ""));
        grid.appendChild(createEditorField("area_id", "area_id", item.area_id || ""));
        grid.appendChild(createEditorField("dungeon_id", "dungeon_id", item.dungeon_id || ""));
        grid.appendChild(createEditorField("spot_type", "spot_type", item.spot_type || ""));
        ui.editor.form.appendChild(grid);
        ui.editor.form.appendChild(
          createEditorField("connections", "connections", Array.isArray(item.connections) ? item.connections.join("\n") : "", {
            type: "textarea",
            hint: "1行1スポットID"
          })
        );
        ui.editor.form.appendChild(createEditorField("description", "description", item.description || "", { type: "textarea" }));
        return;
      }

      if (category === "characters") {
        grid.appendChild(createEditorField("name", "name", item.name || ""));
        ui.editor.form.appendChild(grid);
        ui.editor.form.appendChild(createEditorField("tags", "tags", Array.isArray(item.tags) ? item.tags.join(", ") : "", {
          hint: "カンマ区切り"
        }));
        ui.editor.form.appendChild(createEditorField("description", "description", item.description || "", { type: "textarea" }));
        ui.editor.form.appendChild(createEditorField("base_stats", "base_stats", JSON.stringify(item.base_stats || {}, null, 2), {
          type: "textarea",
          hint: "JSON形式"
        }));
        return;
      }

      if (category === "items") {
        grid.appendChild(createEditorField("name", "name", item.name || ""));
        grid.appendChild(createEditorField("item_type", "item_type", item.item_type || ""));
        ui.editor.form.appendChild(grid);
        ui.editor.form.appendChild(createEditorField("tags", "tags", Array.isArray(item.tags) ? item.tags.join(", ") : "", {
          hint: "カンマ区切り"
        }));
        ui.editor.form.appendChild(createEditorField("description", "description", item.description || "", { type: "textarea" }));

        const flagsGrid = document.createElement("div");
        flagsGrid.className = "editor-grid";
        flagsGrid.appendChild(createEditorField("stackable", "stackable", item.stackable, { type: "checkbox" }));
        flagsGrid.appendChild(createEditorField("consumable", "consumable", item.consumable, { type: "checkbox" }));
        ui.editor.form.appendChild(flagsGrid);
        return;
      }

      if (category === "events") {
        grid.appendChild(createEditorField("title", "title", item.title || ""));
        grid.appendChild(createEditorField("event_type", "event_type", item.event_type || ""));
        grid.appendChild(createEditorField("spot_id", "spot_id", item.spot_id || ""));
        grid.appendChild(createEditorField("participants", "participants", Array.isArray(item.participants) ? item.participants.join(", ") : "", {
          hint: "カンマ区切り"
        }));
        ui.editor.form.appendChild(grid);
        ui.editor.form.appendChild(createEditorField("text", "text", JSON.stringify(item.text || [], null, 2), {
          type: "textarea",
          hint: "文字列または文字列配列のJSON"
        }));
        ui.editor.form.appendChild(createEditorField("conditional_texts", "conditional_texts", JSON.stringify(item.conditional_texts || [], null, 2), {
          type: "textarea",
          hint: "JSON形式"
        }));
        ui.editor.form.appendChild(createEditorField("actions", "actions", JSON.stringify(item.actions || [], null, 2), {
          type: "textarea",
          large: true,
          hint: "JSON形式"
        }));
        ui.editor.form.appendChild(createEditorField("choices", "choices", JSON.stringify(item.choices || [], null, 2), {
          type: "textarea",
          large: true,
          hint: "JSON形式"
        }));
        return;
      }

      if (category === "scenarios") {
        const draft = ensureEditorDraft();
        const eventOptions = buildReferenceOptions(draft.events, "title");
        grid.appendChild(createEditorField("title", "title", item.title || ""));
        grid.appendChild(createEditorField("start_event_id", "start_event_id", item.start_event_id || "", {
          type: "select",
          options: eventOptions
        }));
        grid.appendChild(createEditorField("game_over_event_id", "game_over_event_id", item.game_over_event_id || "", {
          type: "select",
          options: eventOptions
        }));
        ui.editor.form.appendChild(grid);
        ui.editor.form.appendChild(createEditorField("event_ids", "event_ids", Array.isArray(item.event_ids) ? item.event_ids.join(", ") : "", {
          hint: "カンマ区切り"
        }));
        ui.editor.form.appendChild(createEditorField("movement_rules", "movement_rules", JSON.stringify(item.movement_rules || {}, null, 2), {
          type: "textarea",
          hint: "JSON形式"
        }));
        ui.editor.form.appendChild(createEditorField("overlay", "overlay", JSON.stringify(item.overlay || {}, null, 2), {
          type: "textarea",
          hint: "JSON形式"
        }));
        return;
      }

      if (category === "quests") {
        const draft = ensureEditorDraft();
        const scenarioOptions = buildReferenceOptions(draft.scenarios, "title");
        const eventOptions = buildReferenceOptions(draft.events, "title");
        grid.appendChild(createEditorField("title", "title", item.title || ""));
        ui.editor.form.appendChild(grid);
        ui.editor.form.appendChild(createEditorField("description", "description", item.description || "", { type: "textarea" }));
        ui.editor.form.appendChild(createEditorField("related_scenario_ids", "related_scenario_ids", Array.isArray(item.related_scenario_ids) ? item.related_scenario_ids.join(", ") : "", {
          hint: scenarioOptions.length > 0 ? `候補: ${scenarioOptions.map((entry) => entry.value).join(", ")}` : "カンマ区切り"
        }));
        ui.editor.form.appendChild(createEditorField("start_event_id", "start_event_id", item.start_event_id || "", {
          type: "select",
          options: eventOptions
        }));
        ui.editor.form.appendChild(createEditorField("event_ids", "event_ids", Array.isArray(item.event_ids) ? item.event_ids.join(", ") : "", {
          hint: eventOptions.length > 0 ? `候補: ${eventOptions.map((entry) => entry.value).join(", ")}` : "カンマ区切り"
        }));
        ui.editor.form.appendChild(createEditorField("restrictions", "restrictions", JSON.stringify(item.restrictions || {}, null, 2), {
          type: "textarea",
          hint: "JSON形式"
        }));
        ui.editor.form.appendChild(createEditorField("completion", "completion", JSON.stringify(item.completion || {}, null, 2), {
          type: "textarea",
          hint: "JSON形式"
        }));
      }
    }

    function renderEditor() {
      ensureEditorDraft();

      if (ui.editor.modeSelect) {
        ui.editor.modeSelect.value = ui.editor.modeSelect.value || "json";
      }

      ui.editor.categorySelect.innerHTML = "";
      EDITOR_CATEGORIES.forEach((category) => {
        const option = document.createElement("option");
        option.value = category.value;
        option.textContent = category.label;
        ui.editor.categorySelect.appendChild(option);
      });
      ui.editor.categorySelect.value = game.editorSelection.category;

      const entries = getEditorItemEntries(game.editorSelection.category);
      if (!entries.some((entry) => entry.id === game.editorSelection.itemId)) {
        game.editorSelection.itemId = entries[0]?.id || (game.editorSelection.category === "initial_state" ? "initial_state" : "");
      }

      ui.editor.itemSelect.innerHTML = "";
      entries.forEach((entry) => {
        const option = document.createElement("option");
        option.value = entry.id;
        option.textContent = entry.label;
        ui.editor.itemSelect.appendChild(option);
      });

      if (game.editorSelection.itemId) {
        ui.editor.itemSelect.value = game.editorSelection.itemId;
      }

      ui.editor.itemSelect.disabled = game.editorSelection.category === "initial_state";
      ui.editor.duplicateButton.disabled = !game.editorSelection.itemId || game.editorSelection.category === "initial_state";
      ui.editor.deleteButton.disabled = !game.editorSelection.itemId || game.editorSelection.category === "initial_state";

      renderEditorForm(game.editorSelection.category, game.editorSelection.itemId);
      toggleEditorMode();
      try {
        const fragment = buildFragmentPayloadFromSelection();
        ui.aiAssist.fragmentInput.value = JSON.stringify(fragment.payload, null, 2);
      } catch (error) {
        // フォーム再描画時の補助同期なので、失敗してもUI全体は止めない
      }
    }

    function getEditorFieldValue(name) {
      const field = ui.editor.form.querySelector(`[data-field="${name}"]`);
      if (!field) return "";
      if (field.type === "checkbox") {
        return field.checked;
      }
      return field.value;
    }

    function applyEditorFormChanges() {
      ensureEditorDraft();
      const category = game.editorSelection.category;

      if (category === "initial_state") {
        game.editorDraft.initial_state.player_character_id = String(getEditorFieldValue("player_character_id") || "").trim();
        game.editorDraft.initial_state.active_scenario_id = String(getEditorFieldValue("active_scenario_id") || "").trim();
        game.editorDraft.initial_state.active_quest_ids = parseCommaList(String(getEditorFieldValue("active_quest_ids") || ""));
        game.editorDraft.initial_state.primary_quest_id = String(getEditorFieldValue("primary_quest_id") || "").trim();
        game.editorDraft.initial_state.current_event_id = String(getEditorFieldValue("current_event_id") || "").trim();
        game.editorDraft.initial_state.current_spot_id = String(getEditorFieldValue("current_spot_id") || "").trim();
        game.editorDraft.initial_state.time = parseJsonField(String(getEditorFieldValue("time") || ""), {});
        game.editorDraft.initial_state.flags = parseLineList(String(getEditorFieldValue("flags") || ""));
        syncDraftInitialStateReferences();
        return;
      }

      const collection = getEditorCollection(category);
      const oldId = game.editorSelection.itemId;
      const item = isPlainObject(collection[oldId]) ? cloneJson(collection[oldId]) : getDefaultEditorItem(category, oldId);
      const nextId = String(getEditorFieldValue("__id") || "").trim();

      if (!nextId) {
        throw new Error("id は必須です。");
      }

      if (nextId !== oldId && collection[nextId]) {
        throw new Error(`id '${nextId}' は既に存在します。`);
      }

      if (category === "areas") {
        item.name = String(getEditorFieldValue("name") || "").trim();
        item.description = String(getEditorFieldValue("description") || "").trim();
      } else if (category === "dungeons") {
        item.name = String(getEditorFieldValue("name") || "").trim();
        item.area_id = String(getEditorFieldValue("area_id") || "").trim();
        item.type = String(getEditorFieldValue("type") || "").trim();
        item.description = String(getEditorFieldValue("description") || "").trim();
      } else if (category === "spots") {
        item.name = String(getEditorFieldValue("name") || "").trim();
        item.area_id = String(getEditorFieldValue("area_id") || "").trim();
        item.dungeon_id = String(getEditorFieldValue("dungeon_id") || "").trim();
        item.spot_type = String(getEditorFieldValue("spot_type") || "").trim();
        item.connections = parseLineList(String(getEditorFieldValue("connections") || ""));
        item.description = String(getEditorFieldValue("description") || "").trim();
      } else if (category === "characters") {
        item.name = String(getEditorFieldValue("name") || "").trim();
        item.tags = parseCommaList(String(getEditorFieldValue("tags") || ""));
        item.description = String(getEditorFieldValue("description") || "").trim();
        item.base_stats = parseJsonField(String(getEditorFieldValue("base_stats") || ""), {});
      } else if (category === "items") {
        item.name = String(getEditorFieldValue("name") || "").trim();
        item.item_type = String(getEditorFieldValue("item_type") || "").trim();
        item.tags = parseCommaList(String(getEditorFieldValue("tags") || ""));
        item.description = String(getEditorFieldValue("description") || "").trim();
        item.stackable = Boolean(getEditorFieldValue("stackable"));
        item.consumable = Boolean(getEditorFieldValue("consumable"));
      } else if (category === "events") {
        item.title = String(getEditorFieldValue("title") || "").trim();
        item.event_type = String(getEditorFieldValue("event_type") || "").trim();
        item.spot_id = String(getEditorFieldValue("spot_id") || "").trim();
        item.participants = parseCommaList(String(getEditorFieldValue("participants") || ""));
        item.text = parseJsonField(String(getEditorFieldValue("text") || ""), []);
        item.conditional_texts = parseJsonField(String(getEditorFieldValue("conditional_texts") || ""), []);
        item.actions = parseJsonField(String(getEditorFieldValue("actions") || ""), []);
        item.choices = parseJsonField(String(getEditorFieldValue("choices") || ""), []);
      } else if (category === "scenarios") {
        item.title = String(getEditorFieldValue("title") || "").trim();
        item.start_event_id = String(getEditorFieldValue("start_event_id") || "").trim();
        item.game_over_event_id = String(getEditorFieldValue("game_over_event_id") || "").trim();
        item.event_ids = parseCommaList(String(getEditorFieldValue("event_ids") || ""));
        item.movement_rules = parseJsonField(String(getEditorFieldValue("movement_rules") || ""), {});
        item.overlay = parseJsonField(String(getEditorFieldValue("overlay") || ""), {});
      } else if (category === "quests") {
        item.title = String(getEditorFieldValue("title") || "").trim();
        item.description = String(getEditorFieldValue("description") || "").trim();
        item.related_scenario_ids = parseCommaList(String(getEditorFieldValue("related_scenario_ids") || ""));
        item.start_event_id = String(getEditorFieldValue("start_event_id") || "").trim();
        item.event_ids = parseCommaList(String(getEditorFieldValue("event_ids") || ""));
        item.restrictions = parseJsonField(String(getEditorFieldValue("restrictions") || ""), {});
        item.completion = parseJsonField(String(getEditorFieldValue("completion") || ""), {});
      }

      if (nextId !== oldId) {
        delete collection[oldId];
      }
      collection[nextId] = item;
      game.editorSelection.itemId = nextId;
    }

    function toggleEditorMode() {
      const isEditorMode = ui.editor.modeSelect?.value === "editor";
      ui.editor.panel.classList.toggle("hidden", !isEditorMode);
      ui.aiAssist.card.classList.toggle("hidden", !isEditorMode);
    }

    function rebuildEditorFromTextarea() {
      const parsed = parseJsonSafely(ui.setup.scriptInput.value.trim());

      if (!parsed.ok) {
        setGlobalStatus("fail", "JSON解析失敗:\n" + parsed.error);
        buildEditorStatus("fail", "JSON解析に失敗しました。");
        return;
      }

      const errors = validateScript(parsed.data);
      if (errors.length > 0) {
        setGlobalStatus("fail", "台本エラー:\n" + errors.join("\n"));
        buildEditorStatus("fail", "JSONから再構築できませんでした。");
        return;
      }

      loadEditorDraft(parsed.data);
      buildEditorStatus("ok", "JSONから基本エディタを再構築しました。");
      setGlobalStatus("ok", "JSONから基本エディタを再構築しました。");
    }

    function applyEditorToTextarea() {
      try {
        applyEditorFormChanges();
        const integrated = buildIntegratedEditorJson();
        const errors = validateScript(integrated);

        if (errors.length > 0) {
          throw new Error(errors.join("\n"));
        }

        ui.setup.scriptInput.value = JSON.stringify(integrated, null, 2);
        game.editorDraft = cloneJson(integrated);
        renderEditor();
        buildEditorStatus("ok", "基本エディタの内容を統合JSONへ反映しました。");
        setGlobalStatus("ok", "基本エディタの内容をJSON入力欄へ反映しました。");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        buildEditorStatus("fail", "反映に失敗しました: " + message);
        setGlobalStatus("fail", "エディタ反映失敗:\n" + message);
      }
    }

    function downloadTextFile(filename, text) {
      const blob = new Blob([text], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }

    function saveIntegratedJson() {
      try {
        const text = String(ui.setup.scriptInput.value || "");
        if (!text.trim()) {
          throw new Error("完全JSON欄が空です。");
        }

        const parsed = parseJsonSafely(text);
        const safeTitle = String(parsed.ok && typeof parsed.data?.title === "string" ? parsed.data.title : "holmes_script")
          .replace(/[\\/:*?"<>|]/g, "_")
          .replace(/\s+/g, "_");
        downloadTextFile(`${safeTitle || "holmes_script"}.json`, text);
        buildEditorStatus("ok", "完全JSON欄の内容をダウンロードしました。");
        setGlobalStatus("ok", "完全JSON欄の内容をダウンロードしました。");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        buildEditorStatus("fail", "完全JSON欄のダウンロードに失敗しました: " + message);
        setGlobalStatus("fail", "完全JSON欄ダウンロード失敗:\n" + message);
      }
    }

    function createEditorItem() {
      ensureEditorDraft();
      const category = game.editorSelection.category;

      if (category === "initial_state") {
        buildEditorStatus("warn", "initial_state は新規作成できません。");
        return;
      }

      try {
        if (game.editorSelection.itemId) {
          applyEditorFormChanges();
        }
      } catch (error) {
        buildEditorStatus("fail", "現在の項目を保存できないため、新規作成を中断しました。");
        return;
      }

      const itemId = makeUniqueEditorId(category);
      getEditorCollection(category)[itemId] = getDefaultEditorItem(category, itemId);
      game.editorSelection.itemId = itemId;
      renderEditor();
      buildEditorStatus("ok", `${category} に ${itemId} を追加しました。`);
    }

    function duplicateEditorItem() {
      const category = game.editorSelection.category;
      const itemId = game.editorSelection.itemId;

      if (!itemId || category === "initial_state") {
        buildEditorStatus("warn", "複製できる項目がありません。");
        return;
      }

      try {
        applyEditorFormChanges();
        const collection = getEditorCollection(category);
        const nextId = makeDuplicatedEditorId(category, itemId);
        collection[nextId] = cloneJson(collection[itemId]);
        game.editorSelection.itemId = nextId;
        renderEditor();
        buildEditorStatus("ok", `${itemId} を ${nextId} として複製しました。`);
      } catch (error) {
        buildEditorStatus("fail", "複製に失敗しました。");
      }
    }

    function deleteEditorItem() {
      const category = game.editorSelection.category;
      const itemId = game.editorSelection.itemId;

      if (!itemId || category === "initial_state") {
        buildEditorStatus("warn", "削除できる項目がありません。");
        return;
      }

      const collection = getEditorCollection(category);
      delete collection[itemId];
      const nextEntries = getEditorItemEntries(category);
      game.editorSelection.itemId = nextEntries[0]?.id || "";
      renderEditor();
      buildEditorStatus("ok", `${itemId} を削除しました。`);
    }

    function normalizeScriptStructure(source) {
      if (!isPlainObject(source)) return source;

      const data = cloneJson(source);

      if (!isPlainObject(data.initial_state)) {
        data.initial_state = {};
      }

      if (!isPlainObject(data.scenarios)) {
        data.scenarios = {};
      }

      if (!isPlainObject(data.quests)) {
        data.quests = {};
      }

      if (!isPlainObject(data.events)) {
        data.events = {};
      }

      const activeScenarioId =
        typeof data.initial_state.active_scenario_id === "string" && data.initial_state.active_scenario_id.trim()
          ? data.initial_state.active_scenario_id.trim()
          : "";

      if (isPlainObject(data.scenario)) {
        const legacyScenarioId = activeScenarioId || "main_scenario";
        if (!isPlainObject(data.scenarios[legacyScenarioId])) {
          data.scenarios[legacyScenarioId] = cloneJson(data.scenario);
        }
        delete data.scenario;

        if (!activeScenarioId) {
          data.initial_state.active_scenario_id = legacyScenarioId;
        }
      }

      Object.entries(data.scenarios).forEach(([scenarioId, scenarioDef]) => {
        if (!isPlainObject(scenarioDef)) return;

        if (isPlainObject(scenarioDef.events)) {
          const hadExplicitEventIds = Array.isArray(scenarioDef.event_ids);
          if (!hadExplicitEventIds) {
            scenarioDef.event_ids = [];
          }

          Object.entries(scenarioDef.events).forEach(([eventId, eventDef]) => {
            if (isPlainObject(eventDef) && !isPlainObject(data.events[eventId])) {
              data.events[eventId] = cloneJson(eventDef);
            }
            if (!hadExplicitEventIds && !scenarioDef.event_ids.includes(eventId)) {
              scenarioDef.event_ids.push(eventId);
            }
          });

          delete scenarioDef.events;
        }

        if (!Array.isArray(scenarioDef.event_ids)) {
          scenarioDef.event_ids = [];
        }

        if (
          typeof scenarioDef.start_event_id === "string" &&
          scenarioDef.start_event_id.trim() &&
          !scenarioDef.event_ids.includes(scenarioDef.start_event_id.trim())
        ) {
          scenarioDef.event_ids.unshift(scenarioDef.start_event_id.trim());
        }

        if (
          typeof scenarioDef.game_over_event_id === "string" &&
          scenarioDef.game_over_event_id.trim() &&
          !scenarioDef.event_ids.includes(scenarioDef.game_over_event_id.trim())
        ) {
          scenarioDef.event_ids.push(scenarioDef.game_over_event_id.trim());
        }

        if (!isPlainObject(scenarioDef.quests)) return;

        Object.entries(scenarioDef.quests).forEach(([questId, questDef]) => {
          if (!isPlainObject(questDef)) return;

          if (!isPlainObject(data.quests[questId])) {
            data.quests[questId] = cloneJson(questDef);
          }

          if (!Array.isArray(data.quests[questId].related_scenario_ids)) {
            data.quests[questId].related_scenario_ids = [];
          }

          if (!data.quests[questId].related_scenario_ids.includes(scenarioId)) {
            data.quests[questId].related_scenario_ids.push(scenarioId);
          }
        });

        delete scenarioDef.quests;
      });

      if (isPlainObject(data.world?.base_events)) {
        Object.entries(data.world.base_events).forEach(([eventId, eventDef]) => {
          if (isPlainObject(eventDef) && !isPlainObject(data.events[eventId])) {
            data.events[eventId] = cloneJson(eventDef);
          }
        });
        delete data.world.base_events;
      }

      Object.entries(data.quests).forEach(([, questDef]) => {
        if (!isPlainObject(questDef)) return;
        if (!Array.isArray(questDef.event_ids)) {
          questDef.event_ids = [];
        }
        if (
          typeof questDef.start_event_id === "string" &&
          questDef.start_event_id.trim() &&
          !questDef.event_ids.includes(questDef.start_event_id.trim())
        ) {
          questDef.event_ids.unshift(questDef.start_event_id.trim());
        }
      });

      if (!Array.isArray(data.initial_state.active_quest_ids)) {
        data.initial_state.active_quest_ids = [];
      }

      if (
        typeof data.initial_state.current_quest_id === "string" &&
        data.initial_state.current_quest_id.trim() &&
        !data.initial_state.active_quest_ids.includes(data.initial_state.current_quest_id.trim())
      ) {
        data.initial_state.active_quest_ids.push(data.initial_state.current_quest_id.trim());
      }

      data.initial_state.active_quest_ids = data.initial_state.active_quest_ids
        .filter((questId) => typeof questId === "string" && questId.trim())
        .map((questId) => questId.trim())
        .filter((questId, index, array) => array.indexOf(questId) === index);

      if (
        typeof data.initial_state.primary_quest_id !== "string" ||
        !data.initial_state.primary_quest_id.trim()
      ) {
        data.initial_state.primary_quest_id = data.initial_state.active_quest_ids[0] || "";
      } else {
        data.initial_state.primary_quest_id = data.initial_state.primary_quest_id.trim();
      }

      if (
        data.initial_state.primary_quest_id &&
        !data.initial_state.active_quest_ids.includes(data.initial_state.primary_quest_id)
      ) {
        data.initial_state.active_quest_ids.unshift(data.initial_state.primary_quest_id);
      }

      if (!isPlainObject(data.initial_state.quest_states)) {
        data.initial_state.quest_states = {};
      }

      data.initial_state.active_quest_ids.forEach((questId) => {
        if (!isPlainObject(data.initial_state.quest_states[questId])) {
          data.initial_state.quest_states[questId] = {
            status: "active",
            progress_flags: [],
            completed_at: null
          };
          return;
        }

        if (typeof data.initial_state.quest_states[questId].status !== "string") {
          data.initial_state.quest_states[questId].status = "active";
        }
        if (!Array.isArray(data.initial_state.quest_states[questId].progress_flags)) {
          data.initial_state.quest_states[questId].progress_flags = [];
        }
        if (!("completed_at" in data.initial_state.quest_states[questId])) {
          data.initial_state.quest_states[questId].completed_at = null;
        }
      });

      if (
        typeof data.initial_state.current_quest_id !== "string" ||
        !data.initial_state.current_quest_id.trim()
      ) {
        data.initial_state.current_quest_id = data.initial_state.primary_quest_id || "";
      }

      if (typeof data.initial_state.active_scenario_id !== "string") {
        data.initial_state.active_scenario_id = "";
      }

      return data;
    }

    // =========================================================
    // 3. ゲーム状態の読み取り
    // =========================================================

    function ensureStateCollections() {
      if (!isPlainObject(game.state)) game.state = {};
      if (!Array.isArray(game.state.flags)) game.state.flags = [];
      if (!isPlainObject(game.state.unique)) game.state.unique = {};
      if (!isPlainObject(game.state.characters)) game.state.characters = {};
      if (!isPlainObject(game.state.spot_states)) game.state.spot_states = {};
      if (!Array.isArray(game.state.active_quest_ids)) game.state.active_quest_ids = [];
      if (!isPlainObject(game.state.quest_states)) game.state.quest_states = {};
      if (typeof game.state.active_scenario_id !== "string") game.state.active_scenario_id = "";

      game.state.active_quest_ids = game.state.active_quest_ids
        .filter((questId) => typeof questId === "string" && questId.trim())
        .map((questId) => questId.trim())
        .filter((questId, index, array) => array.indexOf(questId) === index);

      const fallbackQuestId =
        typeof game.state.current_quest_id === "string" && game.state.current_quest_id.trim()
          ? game.state.current_quest_id.trim()
          : "";

      if (
        typeof game.state.primary_quest_id !== "string" ||
        !game.state.primary_quest_id.trim()
      ) {
        game.state.primary_quest_id = game.state.active_quest_ids[0] || fallbackQuestId || "";
      }

      if (game.state.primary_quest_id && !game.state.active_quest_ids.includes(game.state.primary_quest_id)) {
        game.state.active_quest_ids.unshift(game.state.primary_quest_id);
      }

      game.state.current_quest_id = game.state.primary_quest_id || "";

      game.state.active_quest_ids.forEach((questId) => {
        if (!isPlainObject(game.state.quest_states[questId])) {
          game.state.quest_states[questId] = {
            status: "active",
            progress_flags: [],
            completed_at: null
          };
          return;
        }

        if (typeof game.state.quest_states[questId].status !== "string") {
          game.state.quest_states[questId].status = "active";
        }
        if (!Array.isArray(game.state.quest_states[questId].progress_flags)) {
          game.state.quest_states[questId].progress_flags = [];
        }
        if (!("completed_at" in game.state.quest_states[questId])) {
          game.state.quest_states[questId].completed_at = null;
        }
      });
    }

    function getScenarioDefinitions() {
      return isPlainObject(game.runtime?.scenarios) ? game.runtime.scenarios : {};
    }

    function getQuestDefinitions() {
      return isPlainObject(game.runtime?.quests) ? game.runtime.quests : {};
    }

    function getActiveScenarioId() {
      return typeof game.state?.active_scenario_id === "string" ? game.state.active_scenario_id : "";
    }

    function getActiveScenario() {
      const activeScenarioId = getActiveScenarioId();
      if (!activeScenarioId) return null;

      const scenarios = getScenarioDefinitions();
      return isPlainObject(scenarios[activeScenarioId]) ? scenarios[activeScenarioId] : null;
    }

    function getRuntimeAreaDefinitions() {
      const merged = isPlainObject(game.runtime?.world?.areas) ? cloneJson(game.runtime.world.areas) : {};
      const activeScenario = getActiveScenario();

      if (isPlainObject(activeScenario?.overlay?.add_areas)) {
        Object.entries(activeScenario.overlay.add_areas).forEach(([areaId, areaDef]) => {
          if (isPlainObject(areaDef)) {
            merged[areaId] = cloneJson(areaDef);
          }
        });
      }

      return merged;
    }

    function getRuntimeDungeonDefinitions() {
      const merged = isPlainObject(game.runtime?.world?.dungeons) ? cloneJson(game.runtime.world.dungeons) : {};
      const activeScenario = getActiveScenario();

      if (isPlainObject(activeScenario?.overlay?.add_dungeons)) {
        Object.entries(activeScenario.overlay.add_dungeons).forEach(([dungeonId, dungeonDef]) => {
          if (isPlainObject(dungeonDef)) {
            merged[dungeonId] = cloneJson(dungeonDef);
          }
        });
      }

      return merged;
    }

    function getRuntimeSpotDefinitions() {
      const merged = isPlainObject(game.runtime?.world?.spots) ? cloneJson(game.runtime.world.spots) : {};
      const activeScenario = getActiveScenario();

      if (isPlainObject(activeScenario?.overlay?.add_spots)) {
        Object.entries(activeScenario.overlay.add_spots).forEach(([spotId, spotDef]) => {
          if (isPlainObject(spotDef)) {
            merged[spotId] = cloneJson(spotDef);
          }
        });
      }

      if (Array.isArray(activeScenario?.overlay?.disabled_spot_ids)) {
        activeScenario.overlay.disabled_spot_ids.forEach((spotId) => {
          delete merged[spotId];
        });
      }

      return merged;
    }

    function getRuntimeCharacterDefinitions() {
      const merged = isPlainObject(game.runtime?.definitions?.characters) ? cloneJson(game.runtime.definitions.characters) : {};
      const activeScenario = getActiveScenario();

      if (isPlainObject(activeScenario?.overlay?.add_characters)) {
        Object.entries(activeScenario.overlay.add_characters).forEach(([characterId, characterDef]) => {
          if (isPlainObject(characterDef)) {
            merged[characterId] = cloneJson(characterDef);
          }
        });
      }

      return merged;
    }

    function getRuntimeItemDefinitions() {
      const merged = isPlainObject(game.runtime?.definitions?.items) ? cloneJson(game.runtime.definitions.items) : {};
      const activeScenario = getActiveScenario();

      if (isPlainObject(activeScenario?.overlay?.add_items)) {
        Object.entries(activeScenario.overlay.add_items).forEach(([itemId, itemDef]) => {
          if (isPlainObject(itemDef)) {
            merged[itemId] = cloneJson(itemDef);
          }
        });
      }

      return merged;
    }

    function getPrimaryQuestId() {
      if (typeof game.state?.primary_quest_id === "string" && game.state.primary_quest_id.trim()) {
        return game.state.primary_quest_id.trim();
      }

      if (typeof game.state?.current_quest_id === "string" && game.state.current_quest_id.trim()) {
        return game.state.current_quest_id.trim();
      }

      return Array.isArray(game.state?.active_quest_ids) && game.state.active_quest_ids.length > 0
        ? game.state.active_quest_ids[0]
        : "";
    }

    function getQuestById(questId) {
      if (typeof questId !== "string" || !questId.trim()) return null;
      const quests = getQuestDefinitions();
      return isPlainObject(quests[questId]) ? quests[questId] : null;
    }

    function getRuntimeEventDefinitions() {
      return isPlainObject(game.runtime?.events) ? game.runtime.events : {};
    }

    function getGloballyAssignedEventIds() {
      const assignedIds = [];
      const pushId = (eventId) => {
        if (typeof eventId !== "string" || !eventId.trim()) return;
        const normalizedId = eventId.trim();
        if (!assignedIds.includes(normalizedId)) {
          assignedIds.push(normalizedId);
        }
      };

      Object.values(getScenarioDefinitions()).forEach((scenarioDef) => {
        if (!isPlainObject(scenarioDef)) return;
        pushId(scenarioDef.start_event_id);
        pushId(scenarioDef.game_over_event_id);
        if (Array.isArray(scenarioDef.event_ids)) {
          scenarioDef.event_ids.forEach(pushId);
        }
      });

      Object.values(getQuestDefinitions()).forEach((questDef) => {
        if (!isPlainObject(questDef)) return;
        pushId(questDef.start_event_id);
        if (Array.isArray(questDef.event_ids)) {
          questDef.event_ids.forEach(pushId);
        }
      });

      return assignedIds;
    }

    function getUnassignedEventIds() {
      const assignedIds = getGloballyAssignedEventIds();
      return Object.keys(getRuntimeEventDefinitions()).filter((eventId) => !assignedIds.includes(eventId));
    }

    function getReferencedEventIds() {
      const referencedIds = [];
      const pushId = (eventId) => {
        if (typeof eventId !== "string" || !eventId.trim()) return;
        const normalizedId = eventId.trim();
        if (!referencedIds.includes(normalizedId)) {
          referencedIds.push(normalizedId);
        }
      };

      const activeScenario = getActiveScenario();
      if (isPlainObject(activeScenario)) {
        pushId(activeScenario.start_event_id);
        pushId(activeScenario.game_over_event_id);
        if (Array.isArray(activeScenario.event_ids)) {
          activeScenario.event_ids.forEach(pushId);
        }
      }

      if (Array.isArray(game.state?.active_quest_ids)) {
        game.state.active_quest_ids.forEach((questId) => {
          const questDef = getQuestById(questId);
          if (!isPlainObject(questDef)) return;
          pushId(questDef.start_event_id);
          if (Array.isArray(questDef.event_ids)) {
            questDef.event_ids.forEach(pushId);
          }
        });
      }

      getUnassignedEventIds().forEach(pushId);

      return referencedIds;
    }

    function getPlayerCharacterId() {
      return typeof game.state?.player_character_id === "string" ? game.state.player_character_id : "";
    }

    function getPlayerCharacter() {
      const playerCharacterId = getPlayerCharacterId();
      if (!playerCharacterId) return null;
      if (!isPlainObject(game.state?.characters?.[playerCharacterId])) return null;
      return game.state.characters[playerCharacterId];
    }

    function getCharacterById(characterId) {
      if (typeof characterId !== "string") return null;
      if (!isPlainObject(game.state?.characters?.[characterId])) return null;
      return game.state.characters[characterId];
    }

    function getCharacterSpotId(characterId) {
      const character = getCharacterById(characterId);
      return typeof character?.spot_id === "string" ? character.spot_id : "";
    }

    function getPlayerInventory() {
      const playerCharacter = getPlayerCharacter();
      if (!playerCharacter) return [];

      if (!Array.isArray(playerCharacter.inventory)) {
        playerCharacter.inventory = [];
      }
      return playerCharacter.inventory;
    }

    function getInventoryQuantity(itemId) {
      if (typeof itemId !== "string" || !itemId.trim()) return 0;

      let total = 0;
      getPlayerInventory().forEach((entry) => {
        if (typeof entry === "string") {
          if (entry === itemId) total += 1;
          return;
        }

        if (isPlainObject(entry) && entry.item_id === itemId) {
          total += typeof entry.quantity === "number" ? entry.quantity : 1;
        }
      });

      return total;
    }

    function inventoryHasItem(itemId, quantity) {
      const requiredQuantity = typeof quantity === "number" && quantity > 0 ? quantity : 1;
      return getInventoryQuantity(itemId) >= requiredQuantity;
    }

    function getHealthValue() {
      const playerCharacter = getPlayerCharacter();
      const currentStats = isPlainObject(playerCharacter?.current_stats) ? playerCharacter.current_stats : null;
      if (!currentStats) return null;

      for (const key of ["体力", "hp", "health"]) {
        if (typeof currentStats[key] === "number") {
          return currentStats[key];
        }
      }

      return null;
    }

    function getActiveEventById(eventId) {
      if (typeof eventId !== "string" || !eventId.trim()) return null;
      const eventDefinitions = getRuntimeEventDefinitions();
      return isPlainObject(eventDefinitions[eventId]) ? eventDefinitions[eventId] : null;
    }

    function findFirstVisibleEventId(spotId = "") {
      const currentSpotId = spotId || getCharacterSpotId(getPlayerCharacterId());
      if (!currentSpotId) return "";

      const referencedIds = getReferencedEventIds();
      const eventDefinitions = getRuntimeEventDefinitions();

      return referencedIds.find((eventId) =>
        isPlainObject(eventDefinitions[eventId]) && eventDefinitions[eventId].spot_id === currentSpotId
      ) || "";
    }

    function resolveVisibleEvents(spotId = "") {
      const currentSpotId = spotId || getCharacterSpotId(getPlayerCharacterId());
      if (!currentSpotId) return [];

      const referencedIds = getReferencedEventIds();
      const eventDefinitions = getRuntimeEventDefinitions();

      return referencedIds
        .map((eventId) => eventDefinitions[eventId])
        .filter((eventDef) => isPlainObject(eventDef) && eventDef.spot_id === currentSpotId);
    }

    function getCurrentEvent() {
      const currentSpotId = getCharacterSpotId(getPlayerCharacterId());
      const currentEventId = typeof game.currentEventId === "string" ? game.currentEventId.trim() : "";
      const currentEvent = getActiveEventById(currentEventId);

      if (currentEvent && currentEvent.spot_id === currentSpotId) {
        return currentEvent;
      }

      const visibleEvents = resolveVisibleEvents(currentSpotId);
      return visibleEvents.length > 0 ? visibleEvents[0] : null;
    }

    function resolveSpotById(spotId) {
      const spots = getRuntimeSpotDefinitions();
      return isPlainObject(spots[spotId]) ? spots[spotId] : null;
    }

    function resolveAreaById(areaId) {
      const areas = getRuntimeAreaDefinitions();
      return isPlainObject(areas[areaId]) ? areas[areaId] : null;
    }

    function resolveDungeonById(dungeonId) {
      const dungeons = getRuntimeDungeonDefinitions();
      return isPlainObject(dungeons[dungeonId]) ? dungeons[dungeonId] : null;
    }

    function resolveItemById(itemId) {
      if (typeof itemId !== "string" || !itemId.trim()) return null;
      const items = getRuntimeItemDefinitions();
      return isPlainObject(items[itemId]) ? items[itemId] : null;
    }

    function resolveCharacterDefinitionById(characterId) {
      if (typeof characterId !== "string" || !characterId.trim()) return null;
      const characters = getRuntimeCharacterDefinitions();
      return isPlainObject(characters[characterId]) ? characters[characterId] : null;
    }

    function getSpotById(spotId) {
      return resolveSpotById(spotId);
    }

    function getDisplaySpotName(spotId) {
      const spot = getSpotById(spotId);
      return spot && typeof spot.name === "string" ? spot.name : (spotId || "-");
    }

    function getOptionTargetSpotId(option) {
      if (!isPlainObject(option)) return "";

      if (typeof option.target_spot_id === "string" && option.target_spot_id.trim()) {
        return option.target_spot_id.trim();
      }

      const playerCharacterId = getPlayerCharacterId();
      if (playerCharacterId) {
        const playerSpotPath = `characters.${playerCharacterId}.spot_id`;
        const playerSpotValue = getNestedValue(option.effects, `set.${playerSpotPath}`);
        if (typeof playerSpotValue === "string" && playerSpotValue.trim()) {
          return playerSpotValue.trim();
        }
      }

      const currentSpotValue = getNestedValue(option.effects, "set.current_spot_id");
      if (typeof currentSpotValue === "string" && currentSpotValue.trim()) {
        return currentSpotValue.trim();
      }

      return "";
    }

    function getDisplayItemNames() {
      const names = [];

      getPlayerInventory().forEach((entry) => {
        const itemId = typeof entry === "string" ? entry : (isPlainObject(entry) ? entry.item_id : null);
        const quantity = typeof entry === "string"
          ? 1
          : (isPlainObject(entry) && typeof entry.quantity === "number" ? entry.quantity : 1);

        if (itemId) {
          const item = resolveItemById(itemId);
          const name = item && typeof item.name === "string" ? item.name : itemId;
          names.push(quantity > 1 ? `${name}(${quantity})` : name);
        }
      });

      return names;
    }

    function getCurrentSpotItemsText() {
      const currentSpotId = typeof game.state?.current_spot_id === "string" ? game.state.current_spot_id : "";
      const currentSpotState = isPlainObject(game.state?.spot_states?.[currentSpotId])
        ? game.state.spot_states[currentSpotId]
        : null;

      if (!currentSpotState || !Array.isArray(currentSpotState.items) || currentSpotState.items.length === 0) {
        return "なし";
      }

      return currentSpotState.items.map((entry) => {
        const itemId = entry.item_id;
        const quantity = typeof entry.quantity === "number" ? entry.quantity : 1;
        const itemDefinition = resolveItemById(itemId);
        const label = itemDefinition && typeof itemDefinition.name === "string"
          ? itemDefinition.name
          : itemId;
        return `${label} x${quantity}`;
      }).join(" / ");
    }

    function buildNpcSummaryLines() {
      const lines = [];
      const playerCharacterId = getPlayerCharacterId();

      Object.entries(game.state?.characters || {}).forEach(([characterId, character]) => {
        if (characterId === playerCharacterId || !isPlainObject(character)) return;

        const name = resolveCharacterDefinitionById(characterId)?.name || characterId;
        const spotId = typeof character.spot_id === "string" ? character.spot_id : "";
        const status = typeof character.status === "string" ? character.status : "-";

        lines.push(`${name}: ${getDisplaySpotName(spotId)} / ${status}`);
      });

      return lines;
    }

    function buildStateSummary() {
      if (!isPlainObject(game.state)) {
        return "状態データなし";
      }

      const lines = [];
      const playerCharacterId = getPlayerCharacterId();
      const playerCharacter = getPlayerCharacter();
      const primaryQuestId = getPrimaryQuestId();
      const primaryQuest = getQuestById(primaryQuestId);
      const activeScenarioId = getActiveScenarioId();
      const activeScenario = getActiveScenario();
      const currentSpotId = getCharacterSpotId(playerCharacterId);
      const currentEventId = typeof game.state.current_event_id === "string" ? game.state.current_event_id : "";

      if (playerCharacterId) {
        const playerName = resolveCharacterDefinitionById(playerCharacterId)?.name || playerCharacterId;
        lines.push(`プレイヤー: ${playerName}`);
      }

      if (activeScenario) {
        lines.push(`シナリオ: ${activeScenario.title || activeScenarioId}`);
      } else if (activeScenarioId) {
        lines.push(`シナリオID: ${activeScenarioId}`);
      } else {
        lines.push("シナリオ: なし");
      }

      if (primaryQuest) {
        lines.push(`主クエスト: ${primaryQuest.title}`);
      } else if (primaryQuestId) {
        lines.push(`主クエストID: ${primaryQuestId}`);
      }

      if (Array.isArray(game.state.active_quest_ids) && game.state.active_quest_ids.length > 0) {
        lines.push(`進行中クエスト: ${game.state.active_quest_ids.join(" / ")}`);
      }

      if (currentSpotId) {
        lines.push(`現在地: ${getDisplaySpotName(currentSpotId)}`);
      }

      if (currentEventId) {
        lines.push(`現在イベントID: ${currentEventId}`);
      }

      if (playerCharacter && isPlainObject(playerCharacter.current_stats)) {
        const statEntries = Object.entries(playerCharacter.current_stats)
          .filter(([, value]) => typeof value === "number")
          .map(([key, value]) => `${key}: ${value}`);

        if (statEntries.length > 0) {
          lines.push(`ステータス: ${statEntries.join(" / ")}`);
        }
      }

      if (isPlainObject(game.state.unique) && Object.keys(game.state.unique).length > 0) {
        const uniqueEntries = Object.entries(game.state.unique).map(([key, value]) => `${key}: ${value}`);
        lines.push(`固有値: ${uniqueEntries.join(" / ")}`);
      }

      if (Array.isArray(game.state.flags) && game.state.flags.length > 0) {
        lines.push(`フラグ: ${game.state.flags.join(" / ")}`);
      } else {
        lines.push("フラグ: なし");
      }

      const npcSummaryLines = buildNpcSummaryLines();
      if (npcSummaryLines.length > 0) {
        lines.push("NPC位置:");
        npcSummaryLines.forEach((line) => lines.push(`- ${line}`));
      }

      lines.push(`この場所の残アイテム: ${getCurrentSpotItemsText()}`);

      return lines.join("\n");
    }

    function getVisibleEventTextLines(eventDef) {
      const lines = [];
      toArrayText(eventDef.text).forEach((line) => lines.push(line));

      if (Array.isArray(eventDef.conditional_texts)) {
        eventDef.conditional_texts.forEach((entry) => {
          if (!isPlainObject(entry)) return;
          if (!checkConditions(entry.conditions)) return;
          toArrayText(entry.text).forEach((line) => lines.push(line));
        });
      }

      return lines;
    }

    // =========================================================
    // 4. ゲーム状態の更新
    // =========================================================

    function setGlobalStatus(type, message) {
      ui.status.globalStatus.className = `status ${type}`;
      ui.status.globalStatus.textContent = message;
    }

    function addLogEntry(line) {
      game.logEntries.push(line);
      renderLogPanel();
    }

    function appendMessageLine(line) {
      if (typeof line !== "string") return;
      const trimmed = line.trim();
      if (!trimmed) return;
      game.messageHistory.push(trimmed);
    }

    function setCurrentEventId(eventId) {
      game.currentEventId = eventId;
      if (isPlainObject(game.state)) {
        game.state.current_event_id = eventId;
      }
    }

    function setCurrentSpot(spotId) {
      if (!isPlainObject(game.state)) return;
      game.state.current_spot_id = spotId;
    }

    function moveCharacterToSpot(characterId, spotId) {
      const character = getCharacterById(characterId);
      if (!character) return;
      character.spot_id = spotId;
      if (characterId === getPlayerCharacterId()) {
        setCurrentSpot(spotId);
      }
    }

    function syncPlayerSpotToCurrentSpot() {
      const playerCharacterId = getPlayerCharacterId();
      const currentSpotId = typeof game.state?.current_spot_id === "string" ? game.state.current_spot_id : "";
      if (!playerCharacterId || !currentSpotId) return;
      moveCharacterToSpot(playerCharacterId, currentSpotId);
    }

    function addFlag(flag) {
      if (typeof flag !== "string" || !flag.trim()) return;
      ensureStateCollections();
      if (!game.state.flags.includes(flag)) {
        game.state.flags.push(flag);
      }
    }

    function hasFlag(flag) {
      if (typeof flag !== "string" || !flag.trim()) return false;
      ensureStateCollections();
      return game.state.flags.includes(flag);
    }

    function removeFlags(flags) {
      if (!Array.isArray(flags) || flags.length === 0) return;
      ensureStateCollections();
      game.state.flags = game.state.flags.filter((flag) => !flags.includes(flag));
    }

    function addUniqueValue(key, delta) {
      if (typeof key !== "string" || typeof delta !== "number") return;
      ensureStateCollections();
      game.state.unique[key] = (typeof game.state.unique[key] === "number" ? game.state.unique[key] : 0) + delta;
    }

    function advanceGameTime(minutes) {
      if (!isPlainObject(game.state?.time)) return;
      if (typeof minutes !== "number") return;
      addMinutesToTime(game.state.time, minutes);
    }

    function addItemToInventory(itemId, quantity) {
      const inventory = getPlayerInventory();
      const amount = typeof quantity === "number" && quantity > 0 ? quantity : 1;
      const existingEntry = inventory.find((entry) => isPlainObject(entry) && entry.item_id === itemId);

      if (existingEntry) {
        existingEntry.quantity = (typeof existingEntry.quantity === "number" ? existingEntry.quantity : 1) + amount;
        return;
      }

      inventory.push({ item_id: itemId, quantity: amount });
    }

    function removeItemFromInventory(itemId, quantity) {
      const inventory = getPlayerInventory();
      let remaining = typeof quantity === "number" && quantity > 0 ? quantity : 1;

      for (let i = inventory.length - 1; i >= 0 && remaining > 0; i -= 1) {
        const entry = inventory[i];

        if (typeof entry === "string" && entry === itemId) {
          inventory.splice(i, 1);
          remaining -= 1;
          continue;
        }

        if (isPlainObject(entry) && entry.item_id === itemId) {
          const currentQuantity = typeof entry.quantity === "number" ? entry.quantity : 1;
          if (currentQuantity <= remaining) {
            remaining -= currentQuantity;
            inventory.splice(i, 1);
          } else {
            entry.quantity = currentQuantity - remaining;
            remaining = 0;
          }
        }
      }
    }

    function getOrCreateSpotState(spotId) {
      ensureStateCollections();
      if (!isPlainObject(game.state.spot_states[spotId])) {
        game.state.spot_states[spotId] = { items: [] };
      }
      if (!Array.isArray(game.state.spot_states[spotId].items)) {
        game.state.spot_states[spotId].items = [];
      }
      return game.state.spot_states[spotId];
    }

    function removeItemFromSpotState(spotId, itemId, quantity) {
      if (!spotId || !itemId) return;

      const spotState = getOrCreateSpotState(spotId);
      const items = spotState.items;
      let remaining = typeof quantity === "number" && quantity > 0 ? quantity : 1;

      for (let i = items.length - 1; i >= 0 && remaining > 0; i -= 1) {
        const entry = items[i];
        if (!isPlainObject(entry) || entry.item_id !== itemId) continue;

        const currentQuantity = typeof entry.quantity === "number" ? entry.quantity : 1;
        if (currentQuantity <= remaining) {
          remaining -= currentQuantity;
          items.splice(i, 1);
        } else {
          entry.quantity = currentQuantity - remaining;
          remaining = 0;
        }
      }
    }

    // =========================================================
    // 5. 条件判定
    // =========================================================

    function characterSpotConditionMet(characterSpotMap, mode) {
      if (!isPlainObject(characterSpotMap)) return true;

      for (const [characterId, allowedSpotIds] of Object.entries(characterSpotMap)) {
        const currentSpotId = getCharacterSpotId(characterId);
        const normalizedSpotIds = Array.isArray(allowedSpotIds)
          ? allowedSpotIds.filter((spotId) => typeof spotId === "string")
          : [];

        if (normalizedSpotIds.length === 0) return false;

        const matched = normalizedSpotIds.includes(currentSpotId);

        if (mode === "required" && !matched) return false;
        if (mode === "forbidden" && matched) return false;
      }

      return true;
    }

    function checkFlagConditions(conditions) {
      if (Array.isArray(conditions.required_flags) && conditions.required_flags.some((flag) => !game.state.flags.includes(flag))) {
        return false;
      }

      if (Array.isArray(conditions.forbidden_flags) && conditions.forbidden_flags.some((flag) => game.state.flags.includes(flag))) {
        return false;
      }

      return true;
    }

    function checkCharacterSpotConditions(conditions) {
      if (!characterSpotConditionMet(conditions.required_character_spots, "required")) {
        return false;
      }

      if (!characterSpotConditionMet(conditions.forbidden_character_spots, "forbidden")) {
        return false;
      }

      return true;
    }

    function checkInventoryConditions(conditions) {
      if (!Array.isArray(conditions.required_items)) return true;

      for (const item of conditions.required_items) {
        if (typeof item === "string") {
          if (!inventoryHasItem(item, 1)) return false;
          continue;
        }

        if (isPlainObject(item) && typeof item.item_id === "string") {
          if (!inventoryHasItem(item.item_id, item.quantity)) return false;
          continue;
        }

        return false;
      }

      return true;
    }

    function checkStateNumberConditions(conditions) {
      if (isPlainObject(conditions.min)) {
        for (const [path, min] of Object.entries(conditions.min)) {
          const value = getNestedValue(game.state, path);
          if (typeof value !== "number" || value < min) return false;
        }
      }

      if (isPlainObject(conditions.max)) {
        for (const [path, max] of Object.entries(conditions.max)) {
          const value = getNestedValue(game.state, path);
          if (typeof value !== "number" || value > max) return false;
        }
      }

      return true;
    }

    function checkUniqueValueConditions(conditions) {
      if (isPlainObject(conditions.min_unique)) {
        for (const [key, min] of Object.entries(conditions.min_unique)) {
          const value = game.state.unique[key];
          if (typeof value !== "number" || value < min) return false;
        }
      }

      if (isPlainObject(conditions.max_unique)) {
        for (const [key, max] of Object.entries(conditions.max_unique)) {
          const value = game.state.unique[key];
          if (typeof value !== "number" || value > max) return false;
        }
      }

      return true;
    }

    function checkConditions(conditions) {
      if (!isPlainObject(conditions)) return true;
      ensureStateCollections();

      // 1. フラグ条件
      if (!checkFlagConditions(conditions)) return false;

      // 2. NPC位置条件
      if (!checkCharacterSpotConditions(conditions)) return false;

      // 3. 所持アイテム条件
      if (!checkInventoryConditions(conditions)) return false;

      // 4. state 数値条件
      if (!checkStateNumberConditions(conditions)) return false;

      // 5. unique 数値条件
      if (!checkUniqueValueConditions(conditions)) return false;

      return true;
    }

    // =========================================================
    // 6. effects 適用
    // =========================================================

    function applyNumericAddEffects(effects) {
      if (!isPlainObject(effects.add)) return;

      Object.entries(effects.add).forEach(([path, delta]) => {
        if (typeof delta !== "number") return;
        addNestedNumber(game.state, path, delta);
      });
    }

    function applySetEffects(effects) {
      if (!isPlainObject(effects.set)) return;

      Object.entries(effects.set).forEach(([path, value]) => {
        setNestedValue(game.state, path, value);
      });
    }

    function applyFlagEffects(effects) {
      if (Array.isArray(effects.set_flags)) {
        effects.set_flags.forEach((flag) => addFlag(flag));
      }

      if (Array.isArray(effects.remove_flags)) {
        removeFlags(effects.remove_flags);
      }
    }

    function applyUniqueValueEffects(effects) {
      if (!isPlainObject(effects.add_unique)) return;

      Object.entries(effects.add_unique).forEach(([key, delta]) => {
        if (typeof delta !== "number") return;
        addUniqueValue(key, delta);
      });
    }

    function applyInventoryEffects(effects) {
      if (Array.isArray(effects.add_items)) {
        effects.add_items.forEach((entry) => {
          if (typeof entry === "string") {
            addItemToInventory(entry, 1);
            return;
          }
          if (isPlainObject(entry) && typeof entry.item_id === "string") {
            addItemToInventory(entry.item_id, entry.quantity);
          }
        });
      }

      if (Array.isArray(effects.remove_items)) {
        effects.remove_items.forEach((entry) => {
          if (typeof entry === "string") {
            removeItemFromInventory(entry, 1);
            return;
          }
          if (isPlainObject(entry) && typeof entry.item_id === "string") {
            removeItemFromInventory(entry.item_id, entry.quantity);
          }
        });
      }
    }

    function applySpotItemEffects(effects) {
      if (!Array.isArray(effects.remove_spot_items)) return;

      effects.remove_spot_items.forEach((entry) => {
        const spotId = isPlainObject(entry) && typeof entry.spot_id === "string"
          ? entry.spot_id
          : game.state.current_spot_id;
        const itemId = typeof entry === "string"
          ? entry
          : (isPlainObject(entry) ? entry.item_id : null);
        const quantity = isPlainObject(entry) && typeof entry.quantity === "number" && entry.quantity > 0
          ? entry.quantity
          : 1;

        removeItemFromSpotState(spotId, itemId, quantity);
      });
    }

    function applyTimeEffects(effects) {
      if (!isPlainObject(effects.add_time)) return;
      const minutes = typeof effects.add_time.minutes === "number" ? effects.add_time.minutes : 0;
      advanceGameTime(minutes);
    }

    function cloneCurrentTimeOrNull() {
      return isPlainObject(game.state?.time) ? cloneJson(game.state.time) : null;
    }

    function ensureQuestStateEntry(questId) {
      if (typeof questId !== "string" || !questId.trim()) return;
      ensureStateCollections();
      const normalizedQuestId = questId.trim();

      if (!game.state.active_quest_ids.includes(normalizedQuestId)) {
        game.state.active_quest_ids.push(normalizedQuestId);
      }

      if (!isPlainObject(game.state.quest_states[normalizedQuestId])) {
        game.state.quest_states[normalizedQuestId] = {
          status: "active",
          progress_flags: [],
          completed_at: null
        };
      }

      if (typeof game.state.quest_states[normalizedQuestId].status !== "string") {
        game.state.quest_states[normalizedQuestId].status = "active";
      }
      if (!Array.isArray(game.state.quest_states[normalizedQuestId].progress_flags)) {
        game.state.quest_states[normalizedQuestId].progress_flags = [];
      }
      if (!("completed_at" in game.state.quest_states[normalizedQuestId])) {
        game.state.quest_states[normalizedQuestId].completed_at = null;
      }
    }

    function applyScenarioAndQuestEffects(effects) {
      if (typeof effects.start_scenario === "string" && effects.start_scenario.trim()) {
        game.state.active_scenario_id = effects.start_scenario.trim();
        game.state.current_event_id = "";
        setCurrentEventId("");
      }

      if (typeof effects.start_quest === "string" && effects.start_quest.trim()) {
        const questId = effects.start_quest.trim();
        ensureQuestStateEntry(questId);
      }

      if (typeof effects.set_primary_quest === "string" && effects.set_primary_quest.trim()) {
        const questId = effects.set_primary_quest.trim();
        ensureQuestStateEntry(questId);
        game.state.primary_quest_id = questId;
        game.state.current_quest_id = questId;
      }

      if (typeof effects.complete_quest === "string" && effects.complete_quest.trim()) {
        const questId = effects.complete_quest.trim();
        ensureQuestStateEntry(questId);
        game.state.quest_states[questId].status = "completed";
        game.state.quest_states[questId].completed_at = cloneCurrentTimeOrNull();
      }

      ensureStateCollections();
    }

    function applyEffects(effects) {
      if (!isPlainObject(effects)) return;
      ensureStateCollections();

      // 1. 数値加算系
      applyNumericAddEffects(effects);

      // 2. 値設定系
      applySetEffects(effects);

      // 3. フラグ操作
      applyFlagEffects(effects);

      // 4. 固有値操作
      applyUniqueValueEffects(effects);

      // 5. 所持品操作
      applyInventoryEffects(effects);

      // 6. スポット上アイテム操作
      applySpotItemEffects(effects);

      // 7. シナリオ・クエスト進行
      applyScenarioAndQuestEffects(effects);

      // 8. 時間経過
      applyTimeEffects(effects);
    }

    // =========================================================
    // 7. イベント進行
    // =========================================================

    function renderEndingOrGameOverOptions(mode) {
      ui.event.choiceList.innerHTML = "";

      const restartButton = document.createElement("button");
      restartButton.type = "button";
      restartButton.className = "choice-button";
      restartButton.textContent = "最初からやり直す";
      restartButton.addEventListener("click", () => {
        if (!game.loadedSource) {
          setGlobalStatus("warn", "まだ読み込まれた台本がありません。");
          return;
        }
        startScript(game.loadedSource);
        setGlobalStatus("ok", "最初からやり直しました。");
      });

      const continuationButton = document.createElement("button");
      continuationButton.type = "button";
      continuationButton.className = "choice-button";
      continuationButton.textContent = "続篇用プロンプトをコピー";
      continuationButton.addEventListener("click", async () => {
        try {
          await copyTextToClipboard(buildContinuationPrompt());
          setGlobalStatus("ok", "続篇用プロンプトをコピーしました。");
        } catch (error) {
          setGlobalStatus("fail", "続篇プロンプトコピー失敗: " + (error instanceof Error ? error.message : String(error)));
        }
      });

      ui.event.choiceList.appendChild(restartButton);
      ui.event.choiceList.appendChild(continuationButton);

      if (mode === "game_over") {
        setGlobalStatus("fail", "ゲームオーバーです。最初からやり直すか、続篇用プロンプトをコピーできます。");
      } else {
        setGlobalStatus("ok", "エンディングに到達しました。最初からやり直すか、続篇用プロンプトをコピーできます。");
      }
    }

    function enterEvent(eventId) {
      setCurrentEventId(eventId);

      const eventDef = getCurrentEvent();
      if (!eventDef) {
        renderScreen();
        return;
      }

      if (typeof eventDef.spot_id === "string" && eventDef.spot_id.trim()) {
        const playerCharacterId = getPlayerCharacterId();
        if (playerCharacterId) {
          moveCharacterToSpot(playerCharacterId, eventDef.spot_id);
        }
      }

      getVisibleEventTextLines(eventDef).forEach(appendMessageLine);
      renderScreen();
    }

    function redirectToGameOverIfNeeded() {
      const healthValue = getHealthValue();
      if (healthValue === null || healthValue > 0) return false;

      const currentEvent = getCurrentEvent();
      if (currentEvent && currentEvent.event_type === "game_over") {
        return false;
      }

      const activeScenario = getActiveScenario();
      const gameOverEventId = typeof activeScenario?.game_over_event_id === "string"
        ? activeScenario.game_over_event_id.trim()
        : "";

      if (gameOverEventId && getActiveEventById(gameOverEventId)) {
        enterEvent(gameOverEventId);
        setGlobalStatus("fail", "体力が0以下になったため、ゲームオーバーへ遷移しました。");
        return true;
      }

      appendMessageLine("体力が尽きました。");
      renderMessageWindow();
      renderEndingOrGameOverOptions("game_over");
      return true;
    }

    function isRestartChoiceOnGameOver(option) {
      const currentEvent = getCurrentEvent();
      return Boolean(
        currentEvent &&
        currentEvent.event_type === "game_over" &&
        option.next_event_id === null &&
        typeof option.text === "string" &&
        option.text.includes("最初から")
      );
    }

    function handleBlockedOption(option, kind) {
      const message = typeof option.failure_message === "string" && option.failure_message.trim()
        ? option.failure_message
        : "条件を満たしていません。";

      appendMessageLine("▶ " + option.text);
      appendMessageLine(message);
      addLogEntry(`Blocked ${kind}: ${option.text} -> ${message}`);
      renderScreen();
      setGlobalStatus("warn", message);
    }

    function applyOptionSuccess(option, kind) {
      game.stepCount += 1;

      addLogEntry([
        `Step ${game.stepCount}`,
        `Event: ${game.currentEventId || "-"}`,
        `${kind}: ${option.text}`
      ].join("\n"));

      appendMessageLine("▶ " + option.text);
      applyEffects(option.effects);

      if (typeof option.success_message === "string" && option.success_message.trim()) {
        appendMessageLine(option.success_message);
        addLogEntry("Result: " + option.success_message);
      }
    }

    function finishStoryIfTerminalOption() {
      const currentEvent = getCurrentEvent();
      appendMessageLine("この話はこれで終わりです。");
      renderMessageWindow();

      if (currentEvent && currentEvent.event_type === "game_over") {
        renderEndingOrGameOverOptions("game_over");
      } else {
        renderEndingOrGameOverOptions("ending");
      }
    }

    function transitionToNextEvent(nextEventId, kind, optionText) {
      if (typeof nextEventId !== "string" || !nextEventId.trim()) {
        renderScreen();
        return;
      }

      const normalizedNextEventId = nextEventId.trim();

      if (!getActiveEventById(normalizedNextEventId)) {
        const message = "遷移先イベントが存在しません: " + normalizedNextEventId;
        appendMessageLine(message);
        addLogEntry(`Blocked ${kind}: ${optionText} -> ${message}`);
        renderScreen();
        setGlobalStatus("fail", message);
        return;
      }

      enterEvent(normalizedNextEventId);
    }

    function executeActionOrChoice(option, kind) {
      const previousSpotId = getCharacterSpotId(getPlayerCharacterId());

      if (!checkConditions(option.conditions)) {
        handleBlockedOption(option, kind);
        return;
      }

      if (isRestartChoiceOnGameOver(option)) {
        if (!game.loadedSource) {
          setGlobalStatus("warn", "まだ読み込まれた台本がありません。");
          return;
        }
        startScript(game.loadedSource);
        setGlobalStatus("ok", "最初からやり直しました。");
        return;
      }

      applyOptionSuccess(option, kind);

      if (redirectToGameOverIfNeeded()) {
        return;
      }

      if (typeof option.next_event_id === "string" && option.next_event_id.trim()) {
        transitionToNextEvent(option.next_event_id, kind, option.text);
        return;
      }

      const currentSpotId = getCharacterSpotId(getPlayerCharacterId());
      if (currentSpotId && currentSpotId !== previousSpotId) {
        const resolvedEventId = findFirstVisibleEventId(currentSpotId);
        if (resolvedEventId) {
          enterEvent(resolvedEventId);
          return;
        }
      }

      if (option.next_event_id === null) {
        const currentEvent = getCurrentEvent();
        if (currentEvent && (currentEvent.event_type === "ending" || currentEvent.event_type === "game_over")) {
          finishStoryIfTerminalOption();
          return;
        }
      }

      renderScreen();
    }

    // =========================================================
    // 8. 描画
    // =========================================================

    function renderHeaderPanel() {
      ui.header.gameTitle.textContent = game.runtime ? game.runtime.title : "-";
      ui.header.currentEventIdText.textContent = game.currentEventId || "-";
      ui.header.currentSpotIdText.textContent = getDisplaySpotName(
        getCharacterSpotId(getPlayerCharacterId())
      );
      ui.header.currentTimeText.textContent = formatTime(game.state?.time);

      const healthValue = getHealthValue();
      ui.header.healthText.textContent = healthValue === null ? "-" : String(healthValue);
      ui.header.stepText.textContent = String(game.stepCount);
    }

    function renderStatePanel() {
      if (!isPlainObject(game.state)) {
        ui.state.itemsText.textContent = "-";
        ui.state.statePreview.textContent = "状態データなし";
        ui.stateTools.rawStateArea.value = "";
        return;
      }

      const itemNames = getDisplayItemNames();
      ui.state.itemsText.textContent = itemNames.length ? itemNames.join(" / ") : "なし";
      ui.state.statePreview.textContent = buildStateSummary();
      ui.stateTools.rawStateArea.value = JSON.stringify(game.state, null, 2);

      if (game.isRawStateVisible) {
        ui.stateTools.rawStateArea.classList.remove("hidden");
        ui.stateTools.toggleRawStateButton.textContent = "詳細JSONを隠す";
      } else {
        ui.stateTools.rawStateArea.classList.add("hidden");
        ui.stateTools.toggleRawStateButton.textContent = "詳細JSONを表示";
      }
    }

    function renderLogPanel() {
      ui.log.logList.innerHTML = "";

      game.logEntries.slice().reverse().forEach((line) => {
        const item = document.createElement("div");
        item.className = "log-item";
        item.textContent = line;
        ui.log.logList.appendChild(item);
      });
    }

    function renderMessageWindow() {
      ui.event.textArea.innerHTML = "";

      const recentLines = game.messageHistory.slice(-MESSAGE_WINDOW_LIMIT);
      const paddedLines = Array(Math.max(0, MESSAGE_WINDOW_LIMIT - recentLines.length)).fill("").concat(recentLines);

      const messageWindow = document.createElement("div");
      messageWindow.className = "message-window";
      messageWindow.textContent = paddedLines.join("\n");

      ui.event.textArea.appendChild(messageWindow);
    }

    function bindEnabledOptionHandler(button, option, kind) {
      button.addEventListener("click", () => {
        executeActionOrChoice(option, kind);
      });
    }

    function bindBlockedOptionHandler(button, option, kind) {
      button.addEventListener("click", () => {
        appendMessageLine("▶ " + option.text);
        appendMessageLine(option.failure_message);
        addLogEntry(`Blocked ${kind}: ${option.text} -> ${option.failure_message}`);
        renderScreen();
        setGlobalStatus("warn", option.failure_message);
      });
    }

    function buildOptionButton(option, kind, index) {
      const isConditionMet = checkConditions(option.conditions);
      if (!isConditionMet && option.hidden_when_disabled === true) {
        return null;
      }

      const visibleLabel = isConditionMet
        ? option.text
        : (
          typeof option.disabled_text === "string" && option.disabled_text.trim()
            ? option.disabled_text
            : option.text
        );

      const button = document.createElement("button");
      button.type = "button";
      button.className = "choice-button";
      button.textContent = `${index}. ${visibleLabel}`;

      if (isConditionMet) {
        bindEnabledOptionHandler(button, option, kind);
        return button;
      }

      if (typeof option.failure_message === "string" && option.failure_message.trim()) {
        bindBlockedOptionHandler(button, option, kind);
        return button;
      }

      button.disabled = true;
      return button;
    }

    function getNormalMoves(eventDef) {
      const moves = [];
      const playerCharacterId = getPlayerCharacterId();
      if (!playerCharacterId) return moves;

      const currentSpotId = getCharacterSpotId(playerCharacterId);
      const currentSpot = getSpotById(currentSpotId);
      if (!currentSpot || !Array.isArray(currentSpot.connections)) return moves;

      const explicitMoveTargets = new Set();
      if (isPlainObject(eventDef)) {
        [...(Array.isArray(eventDef.actions) ? eventDef.actions : []), ...(Array.isArray(eventDef.choices) ? eventDef.choices : [])]
          .forEach((option) => {
            const targetSpotId = getOptionTargetSpotId(option);
            if (targetSpotId) {
              explicitMoveTargets.add(targetSpotId);
            }
          });
      }

      currentSpot.connections.forEach((connectedSpotId) => {
        if (explicitMoveTargets.has(connectedSpotId)) {
          return;
        }

        if (isMovementAllowed(connectedSpotId)) {
          const spotName = getDisplaySpotName(connectedSpotId);
          moves.push({
            text: `移動: ${spotName}`,
            move_type: "normal",
            target_spot_id: connectedSpotId,
            effects: {
              set: {
                current_spot_id: connectedSpotId,
                [`characters.${playerCharacterId}.spot_id`]: connectedSpotId
              }
            },
            next_event_id: null // 移動後は同じイベントに留まるか、自動遷移？
          });
        }
      });

      return moves;
    }

    function isMovementAllowed(targetSpotId) {
      const movementRules = getActiveScenario()?.movement_rules;
      if (!isPlainObject(movementRules)) return true;
      const targetSpot = getSpotById(targetSpotId);
      if (!targetSpot) return false;

      // default restrictions
      if (isPlainObject(movementRules.default)) {
        const def = movementRules.default;
        if (Array.isArray(def.forbidden_spot_ids) && def.forbidden_spot_ids.includes(targetSpotId)) {
          return false;
        }

        if (Array.isArray(def.allowed_area_ids) && def.allowed_area_ids.length > 0) {
          if (typeof targetSpot.area_id !== "string" || !def.allowed_area_ids.includes(targetSpot.area_id)) {
            return false;
          }
        }

        if (Array.isArray(def.allowed_dungeon_ids) && def.allowed_dungeon_ids.length > 0) {
          if (typeof targetSpot.dungeon_id !== "string" || !def.allowed_dungeon_ids.includes(targetSpot.dungeon_id)) {
            return false;
          }
        }
      }

      // conditional allowances
      if (Array.isArray(movementRules.conditional)) {
        for (const cond of movementRules.conditional) {
          if (isPlainObject(cond) && Array.isArray(cond.allow_spot_ids) && cond.allow_spot_ids.includes(targetSpotId)) {
            if (checkConditions(cond.conditions)) {
              return true;
            }
          }
        }
      }

      // default allow if not forbidden
      return !isPlainObject(movementRules.default) || !Array.isArray(movementRules.default.forbidden_spot_ids) || !movementRules.default.forbidden_spot_ids.includes(targetSpotId);
    }

    function renderOptions(eventDef) {
      ui.event.choiceList.innerHTML = "";

      const orderedOptions = [];

      (Array.isArray(eventDef.actions) ? eventDef.actions : []).forEach((action) => {
        if (isPlainObject(action) && typeof action.text === "string") {
          orderedOptions.push({ kind: "Action", option: action });
        }
      });

      (Array.isArray(eventDef.choices) ? eventDef.choices : []).forEach((choice) => {
        if (isPlainObject(choice) && typeof choice.text === "string") {
          orderedOptions.push({ kind: "Choice", option: choice });
        }
      });

      let index = 1;
      orderedOptions.forEach(({ kind, option }) => {
        const button = buildOptionButton(option, kind, index);
        if (!button) return;

        ui.event.choiceList.appendChild(button);
        index += 1;
      });

      // 通常移動を選択肢の末尾に統合
      const normalMoves = getNormalMoves(eventDef);
      normalMoves.forEach((moveOption, moveIndex) => {
        const button = buildOptionButton(moveOption, "Move", index + moveIndex);
        if (button) {
          ui.event.choiceList.appendChild(button);
        }
      });

      if (!ui.event.choiceList.children.length) {
        setGlobalStatus("fail", "利用可能な選択肢/操作がありません。");
      } else {
        setGlobalStatus("ok", "選択肢または操作を選んで進めてください。");
      }
    }

    function renderScreen() {
      renderHeaderPanel();
      renderStatePanel();

      if (!game.runtime || !game.currentEventId) {
        ui.event.eventTitle.textContent = "-";
        ui.event.speakerLine.textContent = "";
        ui.event.textArea.innerHTML = "";
        ui.event.choiceList.innerHTML = "";
        return;
      }

      const eventDef = getCurrentEvent();
      if (!eventDef) {
        setGlobalStatus("fail", "event が見つかりません: " + game.currentEventId);
        return;
      }

      ui.event.eventTitle.textContent = eventDef.title || game.currentEventId;
      ui.event.speakerLine.textContent = typeof eventDef.speaker === "string" ? eventDef.speaker : "";
      renderMessageWindow();
      renderOptions(eventDef);
    }

    // =========================================================
    // 9. バリデーション
    // =========================================================

    function getValidationScenario(data) {
      const activeScenarioId =
        typeof data.initial_state?.active_scenario_id === "string" && data.initial_state.active_scenario_id.trim()
          ? data.initial_state.active_scenario_id.trim()
          : "";
      return activeScenarioId && isPlainObject(data.scenarios?.[activeScenarioId])
        ? data.scenarios[activeScenarioId]
        : null;
    }

    function getValidationAreaDefinitions(data) {
      const merged = isPlainObject(data.world?.areas) ? cloneJson(data.world.areas) : {};
      const activeScenario = getValidationScenario(data);

      if (isPlainObject(activeScenario?.overlay?.add_areas)) {
        Object.entries(activeScenario.overlay.add_areas).forEach(([areaId, areaDef]) => {
          if (isPlainObject(areaDef)) {
            merged[areaId] = cloneJson(areaDef);
          }
        });
      }

      return merged;
    }

    function getValidationDungeonDefinitions(data) {
      const merged = isPlainObject(data.world?.dungeons) ? cloneJson(data.world.dungeons) : {};
      const activeScenario = getValidationScenario(data);

      if (isPlainObject(activeScenario?.overlay?.add_dungeons)) {
        Object.entries(activeScenario.overlay.add_dungeons).forEach(([dungeonId, dungeonDef]) => {
          if (isPlainObject(dungeonDef)) {
            merged[dungeonId] = cloneJson(dungeonDef);
          }
        });
      }

      return merged;
    }

    function getValidationSpotDefinitions(data) {
      const merged = isPlainObject(data.world?.spots) ? cloneJson(data.world.spots) : {};
      const activeScenario = getValidationScenario(data);

      if (isPlainObject(activeScenario?.overlay?.add_spots)) {
        Object.entries(activeScenario.overlay.add_spots).forEach(([spotId, spotDef]) => {
          if (isPlainObject(spotDef)) {
            merged[spotId] = cloneJson(spotDef);
          }
        });
      }

      if (Array.isArray(activeScenario?.overlay?.disabled_spot_ids)) {
        activeScenario.overlay.disabled_spot_ids.forEach((spotId) => {
          delete merged[spotId];
        });
      }

      return merged;
    }

    function getValidationCharacterDefinitions(data) {
      const merged = isPlainObject(data.definitions?.characters) ? cloneJson(data.definitions.characters) : {};
      const activeScenario = getValidationScenario(data);

      if (isPlainObject(activeScenario?.overlay?.add_characters)) {
        Object.entries(activeScenario.overlay.add_characters).forEach(([characterId, characterDef]) => {
          if (isPlainObject(characterDef)) {
            merged[characterId] = cloneJson(characterDef);
          }
        });
      }

      return merged;
    }

    function getValidationItemDefinitions(data) {
      const merged = isPlainObject(data.definitions?.items) ? cloneJson(data.definitions.items) : {};
      const activeScenario = getValidationScenario(data);

      if (isPlainObject(activeScenario?.overlay?.add_items)) {
        Object.entries(activeScenario.overlay.add_items).forEach(([itemId, itemDef]) => {
          if (isPlainObject(itemDef)) {
            merged[itemId] = cloneJson(itemDef);
          }
        });
      }

      return merged;
    }

    function validateCharacterSpotMap(characterSpotMap, label, errors, data) {
      if (!isPlainObject(characterSpotMap)) {
        errors.push(label + " はオブジェクトである必要があります。");
        return;
      }

      Object.entries(characterSpotMap).forEach(([characterId, spotIds]) => {
        if (!data.initial_state?.characters?.[characterId]) {
          errors.push(`${label}.${characterId} のキャラが initial_state.characters に存在しません: ${characterId}`);
          return;
        }

        if (!Array.isArray(spotIds) || spotIds.length === 0 || spotIds.some((spotId) => typeof spotId !== "string")) {
          errors.push(`${label}.${characterId} は1件以上のスポットID文字列配列である必要があります。`);
          return;
        }

        const spotDefinitions = getValidationSpotDefinitions(data);
        spotIds.forEach((spotId) => {
          if (!spotDefinitions[spotId]) {
            errors.push(`${label}.${characterId} の spot_id が world.spots に存在しません: ${spotId}`);
          }
        });
      });
    }

    function validateConditionsObject(conditions, label, data, errors) {
      if (!isPlainObject(conditions)) return;

      if (conditions.required_character_spots !== undefined) {
        validateCharacterSpotMap(conditions.required_character_spots, `${label}.required_character_spots`, errors, data);
      }

      if (conditions.forbidden_character_spots !== undefined) {
        validateCharacterSpotMap(conditions.forbidden_character_spots, `${label}.forbidden_character_spots`, errors, data);
      }

      if (Array.isArray(conditions.required_items)) {
        conditions.required_items.forEach((item, index) => {
          if (typeof item === "string") return;
          if (!isPlainObject(item) || typeof item.item_id !== "string") {
            errors.push(`${label}.required_items[${index}] は item_id を持つオブジェクトまたは文字列である必要があります。`);
          }
        });
      }
    }

    function validateEffectsObject(effects, label, data, errors) {
      if (!isPlainObject(effects)) return;

      if (isPlainObject(effects.set)) {
        const spotDefinitions = getValidationSpotDefinitions(data);
        Object.entries(effects.set).forEach(([path, value]) => {
          if (path.endsWith(".spot_id") && typeof value === "string" && !spotDefinitions[value]) {
            errors.push(`${label}.set.${path} のスポットIDが world.spots に存在しません: ${value}`);
          }
        });
      }

      if (Array.isArray(effects.add_items)) {
        const itemDefinitions = getValidationItemDefinitions(data);
        effects.add_items.forEach((item, index) => {
          if (typeof item === "string") return;
          if (!isPlainObject(item) || typeof item.item_id !== "string") {
            errors.push(`${label}.add_items[${index}] は item_id を持つオブジェクトまたは文字列である必要があります。`);
            return;
          }
          if (!itemDefinitions[item.item_id]) {
            errors.push(`${label}.add_items[${index}].item_id が definitions.items に存在しません: ${item.item_id}`);
          }
        });
      }

      if (Array.isArray(effects.remove_items)) {
        const itemDefinitions = getValidationItemDefinitions(data);
        effects.remove_items.forEach((item, index) => {
          if (typeof item === "string") {
            if (!itemDefinitions[item]) {
              errors.push(`${label}.remove_items[${index}] の item_id が definitions.items に存在しません: ${item}`);
            }
            return;
          }
          if (!isPlainObject(item) || typeof item.item_id !== "string") {
            errors.push(`${label}.remove_items[${index}] は item_id を持つオブジェクトまたは文字列である必要があります。`);
            return;
          }
          if (!itemDefinitions[item.item_id]) {
            errors.push(`${label}.remove_items[${index}].item_id が definitions.items に存在しません: ${item.item_id}`);
          }
        });
      }

      if (Array.isArray(effects.remove_spot_items)) {
        const itemDefinitions = getValidationItemDefinitions(data);
        const spotDefinitions = getValidationSpotDefinitions(data);
        effects.remove_spot_items.forEach((item, index) => {
          if (typeof item === "string") {
            if (!itemDefinitions[item]) {
              errors.push(`${label}.remove_spot_items[${index}] の item_id が definitions.items に存在しません: ${item}`);
            }
            return;
          }

          if (!isPlainObject(item) || typeof item.item_id !== "string") {
            errors.push(`${label}.remove_spot_items[${index}] は item_id を持つオブジェクトまたは文字列である必要があります。`);
            return;
          }

          if (!itemDefinitions[item.item_id]) {
            errors.push(`${label}.remove_spot_items[${index}].item_id が definitions.items に存在しません: ${item.item_id}`);
          }

          if (typeof item.spot_id === "string" && !spotDefinitions[item.spot_id]) {
            errors.push(`${label}.remove_spot_items[${index}].spot_id が world.spots に存在しません: ${item.spot_id}`);
          }
        });
      }

      if (effects.start_scenario !== undefined) {
        if (typeof effects.start_scenario !== "string") {
          errors.push(`${label}.start_scenario は文字列である必要があります。`);
        } else if (!data.scenarios?.[effects.start_scenario]) {
          errors.push(`${label}.start_scenario が scenarios に存在しません: ${effects.start_scenario}`);
        }
      }

      if (effects.start_quest !== undefined) {
        if (typeof effects.start_quest !== "string") {
          errors.push(`${label}.start_quest は文字列である必要があります。`);
        } else if (!data.quests?.[effects.start_quest]) {
          errors.push(`${label}.start_quest が quests に存在しません: ${effects.start_quest}`);
        }
      }

      if (effects.set_primary_quest !== undefined) {
        if (typeof effects.set_primary_quest !== "string") {
          errors.push(`${label}.set_primary_quest は文字列である必要があります。`);
        } else if (!data.quests?.[effects.set_primary_quest]) {
          errors.push(`${label}.set_primary_quest が quests に存在しません: ${effects.set_primary_quest}`);
        }
      }

      if (effects.complete_quest !== undefined) {
        if (typeof effects.complete_quest !== "string") {
          errors.push(`${label}.complete_quest は文字列である必要があります。`);
        } else if (!data.quests?.[effects.complete_quest]) {
          errors.push(`${label}.complete_quest が quests に存在しません: ${effects.complete_quest}`);
        }
      }
    }

    function validateTopLevelStructure(data, errors) {
      if (!isPlainObject(data)) {
        errors.push("JSON全体はオブジェクトである必要があります。");
        return;
      }

      if (typeof data.title !== "string" || !data.title.trim()) {
        errors.push("title は空でない文字列である必要があります。");
      }

      if (!isPlainObject(data.definitions)) {
        errors.push("definitions はオブジェクトである必要があります。");
      }

      if (!isPlainObject(data.world)) {
        errors.push("world はオブジェクトである必要があります。");
      }

      if (data.events !== undefined && !isPlainObject(data.events)) {
        errors.push("events は省略可能ですが、存在する場合はオブジェクトである必要があります。");
      }

      if (data.scenarios !== undefined && !isPlainObject(data.scenarios)) {
        errors.push("scenarios は省略可能ですが、存在する場合はオブジェクトである必要があります。");
      }

      if (data.quests !== undefined && !isPlainObject(data.quests)) {
        errors.push("quests は省略可能ですが、存在する場合はオブジェクトである必要があります。");
      }

      if (!isPlainObject(data.initial_state)) {
        errors.push("initial_state はオブジェクトである必要があります。");
      }
    }

    function validateWorldStructure(data, errors) {
      if (data.world?.areas !== undefined && !isPlainObject(data.world?.areas)) {
        errors.push("world.areas は省略可能ですが、存在する場合はオブジェクトである必要があります。");
      }

      if (data.world?.dungeons !== undefined && !isPlainObject(data.world?.dungeons)) {
        errors.push("world.dungeons は省略可能ですが、存在する場合はオブジェクトである必要があります。");
      }

      if (data.world?.spots !== undefined && !isPlainObject(data.world?.spots)) {
        errors.push("world.spots は省略可能ですが、存在する場合はオブジェクトである必要があります。");
        return;
      }

      if (data.world?.base_events !== undefined) {
        errors.push("world.base_events は廃止されました。top-level events を使用してください。");
      }

      const areaDefinitions = getValidationAreaDefinitions(data);
      const dungeonDefinitions = getValidationDungeonDefinitions(data);
      const spotDefinitions = getValidationSpotDefinitions(data);

      if (Object.keys(spotDefinitions).length === 0) {
        errors.push("world.spots または active scenario.overlay.add_spots のいずれかに1件以上のスポットが必要です。");
        return;
      }

      Object.entries(spotDefinitions).forEach(([spotId, spot]) => {
        const label = `world.spots.${spotId}`;

        if (!isPlainObject(spot)) {
          errors.push(`${label} はオブジェクトである必要があります。`);
          return;
        }

        if (typeof spot.area_id !== "string" || !spot.area_id.trim()) {
          errors.push(`${label}.area_id は必須の文字列です。`);
        } else if (!areaDefinitions[spot.area_id]) {
          errors.push(`${label}.area_id が world.areas に存在しません: ${spot.area_id}`);
        }

        if (spot.dungeon_id !== undefined) {
          if (typeof spot.dungeon_id !== "string" || !spot.dungeon_id.trim()) {
            errors.push(`${label}.dungeon_id は省略可能ですが、存在する場合は文字列である必要があります。`);
          } else if (!dungeonDefinitions[spot.dungeon_id]) {
            errors.push(`${label}.dungeon_id が world.dungeons に存在しません: ${spot.dungeon_id}`);
          } else {
            const dungeon = dungeonDefinitions[spot.dungeon_id];
            if (typeof dungeon.area_id === "string" && typeof spot.area_id === "string" && dungeon.area_id !== spot.area_id) {
              errors.push(`${label} の area_id (${spot.area_id}) と dungeon.area_id (${dungeon.area_id}) が一致しません。`);
            }
          }
        }

        if (Array.isArray(spot.connections)) {
          spot.connections.forEach((connectedSpotId, index) => {
            if (typeof connectedSpotId !== "string") {
              errors.push(`${label}.connections[${index}] は文字列である必要があります。`);
            } else if (!spotDefinitions[connectedSpotId]) {
              errors.push(`${label}.connections[${index}] が world.spots に存在しません: ${connectedSpotId}`);
            }
          });
        }
      });
    }

    function validateInitialState(data, errors) {
      if (!isPlainObject(data.initial_state?.characters)) {
        errors.push("initial_state.characters はオブジェクトである必要があります。");
      }

      if (!isPlainObject(data.initial_state?.spot_states)) {
        errors.push("initial_state.spot_states はオブジェクトである必要があります。");
      }

      if (!isPlainObject(data.initial_state?.time)) {
        errors.push("initial_state.time はオブジェクトである必要があります。");
      }

      if (typeof data.initial_state?.player_character_id !== "string" || !data.initial_state.player_character_id.trim()) {
        errors.push("initial_state.player_character_id は空でない文字列である必要があります。");
      }

      if (
        typeof data.initial_state?.active_scenario_id === "string" &&
        data.initial_state.active_scenario_id.trim() &&
        !isPlainObject(data.scenarios?.[data.initial_state.active_scenario_id.trim()])
      ) {
        errors.push(`initial_state.active_scenario_id が scenarios に存在しません: ${data.initial_state.active_scenario_id}`);
      }

      if (data.initial_state?.active_quest_ids !== undefined && !Array.isArray(data.initial_state.active_quest_ids)) {
        errors.push("initial_state.active_quest_ids は省略可能ですが、存在する場合は配列である必要があります。");
      }

      if (
        typeof data.initial_state?.primary_quest_id === "string" &&
        data.initial_state.primary_quest_id.trim() &&
        !isPlainObject(data.quests?.[data.initial_state.primary_quest_id.trim()])
      ) {
        errors.push(`initial_state.primary_quest_id が quests に存在しません: ${data.initial_state.primary_quest_id}`);
      }

      if (
        typeof data.initial_state?.player_character_id === "string" &&
        !isPlainObject(data.initial_state?.characters?.[data.initial_state.player_character_id])
      ) {
        errors.push("initial_state.player_character_id に対応する characters エントリが存在しません。");
      }

      const spotDefinitions = getValidationSpotDefinitions(data);
      const itemDefinitions = getValidationItemDefinitions(data);

      if (isPlainObject(data.initial_state?.characters)) {
        Object.entries(data.initial_state.characters).forEach(([characterId, character]) => {
          if (!isPlainObject(character)) {
            errors.push(`initial_state.characters.${characterId} はオブジェクトである必要があります。`);
            return;
          }

          if (typeof character.spot_id === "string" && character.spot_id.trim() && !spotDefinitions[character.spot_id]) {
            errors.push(`initial_state.characters.${characterId}.spot_id が world.spots に存在しません: ${character.spot_id}`);
          }
        });
      }

      if (isPlainObject(data.initial_state?.spot_states)) {
        Object.entries(data.initial_state.spot_states).forEach(([spotId, spotState]) => {
          if (!spotDefinitions[spotId]) {
            errors.push(`initial_state.spot_states.${spotId} は対応する world.spots が存在しません。`);
            return;
          }

          if (!isPlainObject(spotState)) {
            errors.push(`initial_state.spot_states.${spotId} はオブジェクトである必要があります。`);
            return;
          }

          if (Array.isArray(spotState.items)) {
            spotState.items.forEach((item, index) => {
              if (!isPlainObject(item) || typeof item.item_id !== "string") {
                errors.push(`initial_state.spot_states.${spotId}.items[${index}] は item_id を持つオブジェクトである必要があります。`);
                return;
              }
              if (!itemDefinitions[item.item_id]) {
                errors.push(`initial_state.spot_states.${spotId}.items[${index}].item_id が definitions.items に存在しません: ${item.item_id}`);
              }
            });
          }
        });
      }
    }

    function eventExistsInData(data, eventId) {
      if (typeof eventId !== "string" || !eventId.trim()) return false;
      return isPlainObject(data.events?.[eventId]);
    }

    function validateOptionDefinition(option, label, data, errors) {
      if (!isPlainObject(option)) {
        errors.push(label + " はオブジェクトである必要があります。");
        return;
      }

      if (typeof option.text !== "string" || !option.text.trim()) {
        errors.push(label + ".text は空でない文字列である必要があります。");
      }

      if (option.next_event_id !== undefined && option.next_event_id !== null && typeof option.next_event_id !== "string") {
        errors.push(label + ".next_event_id は文字列または null である必要があります。");
      }

      if (typeof option.next_event_id === "string" && !eventExistsInData(data, option.next_event_id)) {
        errors.push(label + ".next_event_id が存在しません: " + option.next_event_id);
      }

      if (option.conditions !== undefined && !isPlainObject(option.conditions)) {
        errors.push(label + ".conditions はオブジェクトである必要があります。");
      }

      if (option.effects !== undefined && !isPlainObject(option.effects)) {
        errors.push(label + ".effects はオブジェクトである必要があります。");
      }

      validateConditionsObject(option.conditions, `${label}.conditions`, data, errors);
      validateEffectsObject(option.effects, `${label}.effects`, data, errors);
    }

    function validateEventDefinitions(data, errors) {
      Object.entries(data.events || {}).forEach(([eventId, eventDef]) => {
        const label = `events.${eventId}`;

        if (!isMeaningfulId(eventId)) {
          errors.push(label + " のIDは意味ベース英小文字IDにしてください。");
        }

        if (!isPlainObject(eventDef)) {
          errors.push(label + " はオブジェクトである必要があります。");
          return;
        }

        if (typeof eventDef.title !== "string") {
          errors.push(label + ".title は文字列である必要があります。");
        }

        const text = eventDef.text;
        if (!(typeof text === "string" || (Array.isArray(text) && text.every((line) => typeof line === "string")))) {
          errors.push(label + ".text は文字列または文字列配列である必要があります。");
        }

        if (eventDef.spot_id !== undefined && typeof eventDef.spot_id !== "string") {
          errors.push(label + ".spot_id は文字列である必要があります。");
        }

        const spotDefinitions = getValidationSpotDefinitions(data);
        if (typeof eventDef.spot_id === "string" && eventDef.spot_id.trim() && !spotDefinitions[eventDef.spot_id]) {
          errors.push(label + ".spot_id が world.spots に存在しません: " + eventDef.spot_id);
        }

        if (Array.isArray(eventDef.participants)) {
          eventDef.participants.forEach((characterId, index) => {
            if (typeof characterId !== "string") {
              errors.push(`${label}.participants[${index}] は文字列である必要があります。`);
            } else if (!data.initial_state?.characters?.[characterId]) {
              errors.push(`${label}.participants[${index}] のキャラが initial_state.characters に存在しません: ${characterId}`);
            }
          });
        }

        if (Array.isArray(eventDef.conditional_texts)) {
          eventDef.conditional_texts.forEach((entry, index) => {
            if (!isPlainObject(entry)) {
              errors.push(`${label}.conditional_texts[${index}] はオブジェクトである必要があります。`);
              return;
            }

            validateConditionsObject(entry.conditions, `${label}.conditional_texts[${index}].conditions`, data, errors);

            if (!(typeof entry.text === "string" || (Array.isArray(entry.text) && entry.text.every((line) => typeof line === "string")))) {
              errors.push(`${label}.conditional_texts[${index}].text は文字列または文字列配列である必要があります。`);
            }
          });
        }

        const actions = Array.isArray(eventDef.actions) ? eventDef.actions : [];
        const choices = Array.isArray(eventDef.choices) ? eventDef.choices : [];

        if (actions.length === 0 && choices.length === 0) {
          errors.push(label + " は actions または choices のいずれか1件以上が必要です。");
        }

        actions.forEach((action, index) => {
          validateOptionDefinition(action, `${label}.actions[${index}]`, data, errors);
        });

        choices.forEach((choice, index) => {
          validateOptionDefinition(choice, `${label}.choices[${index}]`, data, errors);
        });
      });
    }

    function validateScenarioEvents(data, errors) {
      Object.entries(data.quests || {}).forEach(([questId, questDef]) => {
        const label = `quests.${questId}`;
        if (!isPlainObject(questDef)) {
          errors.push(`${label} はオブジェクトである必要があります。`);
          return;
        }

        if (Array.isArray(questDef.related_scenario_ids)) {
          questDef.related_scenario_ids.forEach((scenarioId, index) => {
            if (typeof scenarioId !== "string") {
              errors.push(`${label}.related_scenario_ids[${index}] は文字列である必要があります。`);
            } else if (!data.scenarios?.[scenarioId]) {
              errors.push(`${label}.related_scenario_ids[${index}] が scenarios に存在しません: ${scenarioId}`);
            }
          });
        }

        if (typeof questDef.start_event_id === "string" && questDef.start_event_id.trim() && !eventExistsInData(data, questDef.start_event_id.trim())) {
          errors.push(`${label}.start_event_id が events に存在しません: ${questDef.start_event_id}`);
        }

        if (Array.isArray(questDef.event_ids)) {
          questDef.event_ids.forEach((eventId, index) => {
            if (typeof eventId !== "string") {
              errors.push(`${label}.event_ids[${index}] は文字列である必要があります。`);
            } else if (!eventExistsInData(data, eventId)) {
              errors.push(`${label}.event_ids[${index}] が events に存在しません: ${eventId}`);
            }
          });
        }
      });

      Object.entries(data.scenarios || {}).forEach(([scenarioId, scenarioDef]) => {
        const scenarioLabel = `scenarios.${scenarioId}`;
        if (!isPlainObject(scenarioDef)) {
          errors.push(`${scenarioLabel} はオブジェクトである必要があります。`);
          return;
        }

        if (
          typeof scenarioDef.start_event_id === "string" &&
          scenarioDef.start_event_id.trim() &&
          !eventExistsInData(data, scenarioDef.start_event_id.trim())
        ) {
          errors.push(`${scenarioLabel}.start_event_id が events に存在しません。`);
        }

        if (
          typeof scenarioDef.game_over_event_id === "string" &&
          scenarioDef.game_over_event_id.trim() &&
          !eventExistsInData(data, scenarioDef.game_over_event_id.trim())
        ) {
          errors.push(`${scenarioLabel}.game_over_event_id が events に存在しません。`);
        }

        if (Array.isArray(scenarioDef.event_ids)) {
          scenarioDef.event_ids.forEach((eventId, index) => {
            if (typeof eventId !== "string") {
              errors.push(`${scenarioLabel}.event_ids[${index}] は文字列である必要があります。`);
            } else if (!eventExistsInData(data, eventId)) {
              errors.push(`${scenarioLabel}.event_ids[${index}] が events に存在しません: ${eventId}`);
            }
          });
        }
      });

      const activeScenarioId =
        typeof data.initial_state?.active_scenario_id === "string" && data.initial_state.active_scenario_id.trim()
          ? data.initial_state.active_scenario_id.trim()
          : "";
      const activeScenario = activeScenarioId ? data.scenarios?.[activeScenarioId] : null;
      const startEventId =
        typeof data.initial_state?.current_event_id === "string" && data.initial_state.current_event_id.trim()
          ? data.initial_state.current_event_id.trim()
          : (typeof activeScenario?.start_event_id === "string" ? activeScenario.start_event_id.trim() : "");

      if (startEventId && !eventExistsInData(data, startEventId)) {
        errors.push("開始イベントが存在しません: " + startEventId);
      }

      if (!startEventId) {
        const playerCharacterId = data.initial_state?.player_character_id;
        const startSpotId =
          typeof playerCharacterId === "string" &&
          typeof data.initial_state?.characters?.[playerCharacterId]?.spot_id === "string"
            ? data.initial_state.characters[playerCharacterId].spot_id
            : "";
        const referencedEventIds = [
          ...(Array.isArray(activeScenario?.event_ids) ? activeScenario.event_ids : [])
        ];
        const hasReferencedSpotEvent = referencedEventIds.some((eventId) => data.events?.[eventId]?.spot_id === startSpotId);

        if (!hasReferencedSpotEvent) {
          errors.push("開始イベントがありません。initial_state.current_event_id、active scenario の start_event_id、または scenario.event_ids に開始地点の event が必要です。");
        }
      }
    }

    function validateScript(data) {
      const normalizedData = normalizeScriptStructure(data);
      const errors = [];

      validateTopLevelStructure(normalizedData, errors);
      if (errors.length > 0 && !isPlainObject(normalizedData)) {
        return errors;
      }

      validateWorldStructure(normalizedData, errors);
      validateInitialState(normalizedData, errors);
      validateEventDefinitions(normalizedData, errors);
      validateScenarioEvents(normalizedData, errors);

      return errors;
    }

    // =========================================================
    // 10. 入出力
    // =========================================================

    function buildContinuationPrompt() {
      const payload = {
        title: game.runtime?.title || null,
        current_event_id: game.currentEventId || null,
        current_spot_id: getCharacterSpotId(getPlayerCharacterId()) || null,
        time: game.state?.time || null,
        step: game.stepCount,
        state: game.state,
        log: game.logEntries
      };

      return [
        "以下の引き継ぎ情報を使って、続篇となる新しいJSON台本を1つ作成してください。",
        "既存JSONへの追記ではなく、新しい別JSONとして作成してください。",
        "新仕様専用です。top-level は definitions / world / events / scenarios / quests / initial_state を使ってください。",
        "有効な世界差分は initial_state.active_scenario_id で指定し、進行中クエストは active_quest_ids / primary_quest_id / quest_states で管理してください。",
        "イベント本体は top-level events に置き、scenario / quest は event_ids や start_event_id で参照してください。",
        "inventory は initial_state.characters[character_id].inventory を使ってください。",
        "spot 上アイテムは initial_state.spot_states を使ってください。",
        "NPC位置は characters.<id>.spot_id で管理してください。",
        "条件では required_character_spots / forbidden_character_spots を使ってよいです。",
        "時刻は initial_state.time を使ってください。",
        "",
        "【引き継ぎ情報(JSON)】",
        JSON.stringify(payload, null, 2),
        "",
        "【出力形式】",
        "- コードブロックは1つのみ",
        "- コードブロックの中身は純粋なJSONのみ",
        "- JSON以外の説明文・前置き・注釈は禁止"
      ].join("\n");
    }

    async function copyCurrentState() {
      const payload = {
        title: game.runtime?.title || null,
        current_event_id: game.currentEventId || null,
        current_spot_id: getCharacterSpotId(getPlayerCharacterId()) || null,
        time: game.state?.time || null,
        step: game.stepCount,
        state: game.state,
        log: game.logEntries
      };

      await copyTextToClipboard(JSON.stringify(payload, null, 2));
    }

    function getAvailableSamples() {
      if (SAMPLE_REGISTRY.length > 0) {
        return SAMPLE_REGISTRY.filter((entry) => isPlainObject(entry) && isPlainObject(entry.data));
      }

      return isPlainObject(SAMPLE_SCENARIO)
        ? [{ id: "default", title: SAMPLE_SCENARIO.title || "サンプル", data: SAMPLE_SCENARIO }]
        : [];
    }

    function populateSampleOptions() {
      const select = ui.setup.sampleSelect;
      if (!select) return;

      select.innerHTML = "";
      getAvailableSamples().forEach((sample, index) => {
        const option = document.createElement("option");
        option.value = sample.id || `sample_${index + 1}`;
        option.textContent = sample.title || option.value;
        select.appendChild(option);
      });
    }

    function loadExampleIntoTextarea() {
      const samples = getAvailableSamples();
      const selectedId = ui.setup.sampleSelect?.value || "";
      const sample =
        samples.find((entry) => entry.id === selectedId) ||
        samples[0] ||
        { title: "サンプル", data: SAMPLE_SCENARIO };

      const normalizedSample = normalizeScriptStructure(sample.data);
      ui.setup.scriptInput.value = JSON.stringify(normalizedSample, null, 2);
      loadEditorDraft(normalizedSample);
      refreshFragmentWorkspace();
      buildEditorStatus("ok", `${sample.title || "サンプル"} を基本エディタへ反映しました。`);
      setGlobalStatus("ok", `${sample.title || "サンプル"} を読み込みました。`);
    }

    async function handleCopyPrompt() {
      try {
        const prompt = getPromptForMode(ui.setup.promptModeSelect.value);
        await copyTextToClipboard(prompt);
        buildAiAssistStatus("ok", "AI用プロンプトをコピーしました。");
        setGlobalStatus("ok", "AI用プロンプトをコピーしました。");
      } catch (error) {
        buildAiAssistStatus("fail", "AI用プロンプトのコピーに失敗しました。");
        setGlobalStatus("fail", "コピー失敗: " + (error instanceof Error ? error.message : String(error)));
      }
    }

    async function handleCopyScript() {
      try {
        const text = String(ui.setup.scriptInput.value || "");
        if (!text.trim()) {
          throw new Error("完全JSON欄が空です。");
        }
        await copyTextToClipboard(text);
        setGlobalStatus("ok", "完全JSON欄の内容をクリップボードへコピーしました。");
      } catch (error) {
        setGlobalStatus("fail", "完全JSON欄コピー失敗: " + (error instanceof Error ? error.message : String(error)));
      }
    }

    async function handleCopyFragment() {
      try {
        await copyTextToClipboard(getFragmentWorkspaceText());
        buildAiAssistStatus("ok", "カテゴリJSONをコピーしました。");
        setGlobalStatus("ok", "カテゴリJSONをコピーしました。");
      } catch (error) {
        buildAiAssistStatus("fail", "カテゴリJSONのコピーに失敗しました。");
        setGlobalStatus("fail", "カテゴリJSONコピー失敗: " + (error instanceof Error ? error.message : String(error)));
      }
    }

    async function handleCopyPromptWithFragment() {
      try {
        const prompt = stripSampleJsonSection(getPromptForMode(ui.setup.promptModeSelect.value));
        const fragmentText = getFragmentWorkspaceText();
        const composed = [
          prompt,
          "",
          "【現在のカテゴリJSON】",
          "```json",
          fragmentText,
          "```"
        ].join("\n");
        await copyTextToClipboard(composed);
        buildAiAssistStatus("ok", "AI用プロンプトとカテゴリJSONをまとめてコピーしました。");
        setGlobalStatus("ok", "AI用プロンプトとカテゴリJSONをコピーしました。");
      } catch (error) {
        buildAiAssistStatus("fail", "プロンプトとカテゴリJSONのコピーに失敗しました。");
        setGlobalStatus("fail", "コピー失敗: " + (error instanceof Error ? error.message : String(error)));
      }
    }

    async function handlePasteScript() {
      try {
        ui.setup.scriptInput.value = "";
        ui.setup.scriptInput.value = await readTextFromClipboard();
        setGlobalStatus("ok", "クリップボードの内容を完全JSON欄へペーストしました。");
      } catch (error) {
        setGlobalStatus("fail", "貼り付け失敗: " + (error instanceof Error ? error.message : String(error)));
      }
    }

    async function handlePasteFragment() {
      try {
        ui.aiAssist.fragmentInput.value = await readTextFromClipboard();
        buildAiAssistStatus("ok", "クリップボードの内容をカテゴリJSON欄に貼り付けました。");
        setGlobalStatus("ok", "カテゴリJSON欄へ貼り付けました。");
      } catch (error) {
        buildAiAssistStatus("fail", "カテゴリJSON欄への貼り付けに失敗しました。");
        setGlobalStatus("fail", "貼り付け失敗: " + (error instanceof Error ? error.message : String(error)));
      }
    }

    function mergeFragmentFromTextarea() {
      const parsed = parseJsonSafely(String(ui.aiAssist.fragmentInput.value || "").trim());

      if (!parsed.ok) {
        buildAiAssistStatus("fail", "カテゴリJSONの解析に失敗しました。");
        setGlobalStatus("fail", "JSON解析失敗:\n" + parsed.error);
        return;
      }

      const classification = classifyJsonPayload(parsed.data);
      if (classification.kind !== "fragment") {
        buildAiAssistStatus("fail", classification.reason || "カテゴリJSONではありません。");
        setGlobalStatus("warn", classification.reason || "カテゴリJSONではありません。");
        return;
      }

      try {
        if (game.editorSelection.itemId) {
          applyEditorFormChanges();
        }

        const report = mergeFragmentIntoDraft(parsed.data);
        if (report.lines.length === 0) {
          throw new Error("マージ対象となるカテゴリJSONキーが見つかりませんでした。");
        }
        const integrated = buildIntegratedEditorJson();
        const errors = validateScript(integrated);
        if (errors.length > 0) {
          throw new Error(errors.join("\n"));
        }

        ui.setup.scriptInput.value = JSON.stringify(integrated, null, 2);
        ui.aiAssist.fragmentInput.value = JSON.stringify(parsed.data, null, 2);
        game.editorDraft = cloneJson(integrated);
        renderEditor();
        const summary = `カテゴリJSONをマージしました。追加 ${report.created} 件 / 上書き ${report.updated} 件`;
        const details = report.lines.length > 0 ? `\n${report.lines.join("\n")}` : "";
        buildAiAssistStatus("ok", summary + details);
        buildEditorStatus("ok", "カテゴリJSONを基本エディタへマージしました。");
        setGlobalStatus("ok", summary);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        buildAiAssistStatus("fail", "カテゴリJSONマージに失敗しました: " + message);
        setGlobalStatus("fail", "カテゴリJSONマージ失敗:\n" + message);
      }
    }

    function saveFragmentJson() {
      try {
        const text = String(ui.aiAssist.fragmentInput.value || "");
        if (!text.trim()) {
          throw new Error("カテゴリJSON欄が空です。");
        }
        const fragment = buildFragmentPayloadFromSelection();
        downloadTextFile(fragment.filename, text);
        buildAiAssistStatus("ok", "カテゴリJSON欄の内容をダウンロードしました。");
        setGlobalStatus("ok", "カテゴリJSON欄の内容をダウンロードしました。");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        buildAiAssistStatus("fail", "カテゴリJSON欄のダウンロードに失敗しました: " + message);
        setGlobalStatus("fail", "カテゴリJSON欄ダウンロード失敗:\n" + message);
      }
    }

    async function handleFragmentFileSelected(event) {
      const file = event.target.files && event.target.files[0];
      if (!file) return;

      try {
        const text = await file.text();
        ui.aiAssist.fragmentInput.value = text;
        buildAiAssistStatus("ok", `カテゴリJSON欄へアップロードしました: ${file.name}`);
        setGlobalStatus("ok", `カテゴリJSON欄へアップロードしました: ${file.name}`);
      } catch (error) {
        buildAiAssistStatus("fail", "カテゴリJSON欄へのアップロードに失敗しました。");
        setGlobalStatus("fail", "カテゴリJSON欄アップロード失敗: " + (error instanceof Error ? error.message : String(error)));
      } finally {
        event.target.value = "";
      }
    }

    async function handleJsonFileSelected(event) {
      const file = event.target.files && event.target.files[0];
      if (!file) return;

      try {
        const text = await file.text();
        ui.setup.scriptInput.value = text;
        buildEditorStatus("ok", `完全JSON欄へアップロードしました: ${file.name}`);
        setGlobalStatus("ok", `完全JSON欄へアップロードしました: ${file.name}`);
      } catch (error) {
        setGlobalStatus("fail", "完全JSON欄アップロード失敗: " + (error instanceof Error ? error.message : String(error)));
      } finally {
        event.target.value = "";
      }
    }

    function startScript(source) {
      const normalizedSource = normalizeScriptStructure(source);

      game.loadedSource = cloneJson(normalizedSource);
      game.runtime = cloneJson(normalizedSource);
      game.editorDraft = cloneJson(normalizedSource);
      game.state = cloneJson(normalizedSource.initial_state || {});
      ensureStateCollections();

      game.stepCount = 0;
      game.logEntries = [];
      game.messageHistory = [];

      // 互換用: initial_state.current_spot_id を player.spot_id に同期
      if (typeof game.state.current_spot_id === "string" && game.state.current_spot_id.trim()) {
        const playerCharacterId = getPlayerCharacterId();
        if (playerCharacterId) {
          moveCharacterToSpot(playerCharacterId, game.state.current_spot_id);
        }
      }

      addLogEntry("開始: " + (normalizedSource.title || "Untitled"));

      const activeScenario = getActiveScenario();

      const startEventId =
        typeof game.state.current_event_id === "string" && game.state.current_event_id.trim()
          ? game.state.current_event_id.trim()
          : (typeof activeScenario?.start_event_id === "string" ? activeScenario.start_event_id.trim() : "");

      setCurrentEventId(startEventId);

      if (!startEventId) {
        const fallbackEventId = findFirstVisibleEventId();
        if (fallbackEventId) {
          setCurrentEventId(fallbackEventId);
          enterEvent(fallbackEventId);
          setGlobalStatus("ok", "開始地点のイベントを表示しました。");
          return;
        }

        renderScreen();
        setGlobalStatus("fail", "開始イベントが設定されていません。");
        return;
      }

      if (redirectToGameOverIfNeeded()) return;
      enterEvent(startEventId);
    }

    function loadScriptFromTextarea() {
      const parsed = parseJsonSafely(ui.setup.scriptInput.value.trim());

      if (!parsed.ok) {
        setGlobalStatus("fail", "JSON解析失敗:\n" + parsed.error);
        return;
      }

      const errors = validateScript(parsed.data);
      if (errors.length > 0) {
        setGlobalStatus("fail", "台本エラー:\n" + errors.join("\n"));
        return;
      }

      startScript(parsed.data);
      setGlobalStatus("ok", "台本を読み込みました。");
    }

    function restartLoaded() {
      if (!game.loadedSource) {
        setGlobalStatus("warn", "まだ読み込まれた台本がありません。");
        return;
      }

      startScript(game.loadedSource);
      setGlobalStatus("ok", "最初からやり直しました。");
    }

    // =========================================================
    // 11. UIイベント登録
    // =========================================================

    function bindUiEvents() {
      ui.setup.loadExampleButton.addEventListener("click", loadExampleIntoTextarea);

      ui.setup.openFileButton.addEventListener("click", () => {
        ui.setup.jsonFileInput.click();
      });

      ui.setup.jsonFileInput.addEventListener("change", handleJsonFileSelected);
      ui.setup.copyPromptButton.addEventListener("click", handleCopyPrompt);
      ui.setup.copyScriptButton.addEventListener("click", handleCopyScript);
      ui.aiAssist.copyPromptWithFragmentButton.addEventListener("click", handleCopyPromptWithFragment);
      ui.aiAssist.copyFragmentButton.addEventListener("click", handleCopyFragment);
      ui.aiAssist.refreshFragmentButton.addEventListener("click", () => {
        refreshFragmentWorkspace();
        buildAiAssistStatus("ok", "現在のカテゴリ内容をカテゴリJSON欄へ反映しました。");
      });
      ui.aiAssist.pasteFragmentButton.addEventListener("click", handlePasteFragment);
      ui.aiAssist.mergeFragmentButton.addEventListener("click", mergeFragmentFromTextarea);
      ui.aiAssist.saveFragmentButton.addEventListener("click", saveFragmentJson);
      ui.aiAssist.loadFragmentFileButton.addEventListener("click", () => {
        ui.aiAssist.fragmentFileInput.click();
      });
      ui.aiAssist.fragmentFileInput.addEventListener("change", handleFragmentFileSelected);
      ui.setup.pasteScriptButton.addEventListener("click", handlePasteScript);
      ui.setup.loadScriptButton.addEventListener("click", loadScriptFromTextarea);
      ui.setup.restartButton.addEventListener("click", restartLoaded);

      ui.setup.copyStatusButton.addEventListener("click", async () => {
        try {
          await copyTextToClipboard(ui.status.globalStatus.textContent || "");
          setGlobalStatus("ok", "通知欄の内容をコピーしました。");
        } catch (error) {
          setGlobalStatus("fail", "通知コピー失敗: " + (error instanceof Error ? error.message : String(error)));
        }
      });

      ui.setup.copyStateButton.addEventListener("click", async () => {
        try {
          await copyCurrentState();
          setGlobalStatus("ok", "現在状態をコピーしました。");
        } catch (error) {
          setGlobalStatus("fail", "状態コピー失敗: " + (error instanceof Error ? error.message : String(error)));
        }
      });

      ui.setup.copyContinuationButton.addEventListener("click", async () => {
        try {
          await copyTextToClipboard(buildContinuationPrompt());
          setGlobalStatus("ok", "続篇用プロンプトをコピーしました。");
        } catch (error) {
          setGlobalStatus("fail", "続篇プロンプトコピー失敗: " + (error instanceof Error ? error.message : String(error)));
        }
      });

      ui.stateTools.toggleRawStateButton.addEventListener("click", () => {
        game.isRawStateVisible = !game.isRawStateVisible;
        renderStatePanel();
      });

      ui.editor.modeSelect.addEventListener("change", toggleEditorMode);
      ui.editor.categorySelect.addEventListener("change", () => {
        try {
          if (game.editorSelection.itemId) {
            applyEditorFormChanges();
          }
        } catch (error) {
          buildEditorStatus("fail", "現在の編集内容にエラーがあるため、カテゴリを切り替えられません。");
          renderEditor();
          return;
        }

        game.editorSelection.category = ui.editor.categorySelect.value;
        const entries = getEditorItemEntries(game.editorSelection.category);
        game.editorSelection.itemId = entries[0]?.id || (game.editorSelection.category === "initial_state" ? "initial_state" : "");
        renderEditor();
      });
      ui.editor.itemSelect.addEventListener("change", () => {
        try {
          if (game.editorSelection.itemId) {
            applyEditorFormChanges();
          }
        } catch (error) {
          buildEditorStatus("fail", "現在の編集内容にエラーがあるため、項目を切り替えられません。");
          renderEditor();
          return;
        }

        game.editorSelection.itemId = ui.editor.itemSelect.value;
        renderEditor();
      });
      ui.editor.newButton.addEventListener("click", createEditorItem);
      ui.editor.duplicateButton.addEventListener("click", duplicateEditorItem);
      ui.editor.deleteButton.addEventListener("click", deleteEditorItem);
      ui.editor.applyButton.addEventListener("click", applyEditorToTextarea);
      ui.editor.rebuildButton.addEventListener("click", rebuildEditorFromTextarea);
      ui.editor.saveIntegratedJsonButton.addEventListener("click", saveIntegratedJson);
    }

    // =========================================================
    // 12. 初期化
    // =========================================================

    function initialize() {
      renderHeaderPanel();
      renderStatePanel();
      renderLogPanel();
      renderEditor();
      populateSampleOptions();
      bindUiEvents();
      loadExampleIntoTextarea();
    }

    initialize();
  })();

