window.HOLMES_SAMPLE_REGISTRY = window.HOLMES_SAMPLE_REGISTRY || [];

function configureHolmesSampleEventOwnership(sample) {
  if (!sample || !sample.scenarios || !sample.scenarios.escape_manor_scenario) {
    return sample;
  }

  const scenarioDef = sample.scenarios.escape_manor_scenario;
  const questDef = scenarioDef.quests && scenarioDef.quests.escape_manor;
  const events = scenarioDef.events || {};
  const entranceEvent = events.entrance_hall_event;

  scenarioDef.event_ids = [
    "entrance_hall_event",
    "basement_stairs_event",
    "greenhouse_event",
    "normal_escape_end_event",
    "trapped_game_over_event"
  ];

  if (questDef) {
    questDef.event_ids = [
      "study_event",
      "basement_vault_event",
      "hidden_passage_event",
      "deduction_escape_end_event"
    ];
  }

  if (entranceEvent && Array.isArray(entranceEvent.choices)) {
    const hasFlavorChoice = entranceEvent.choices.some((choice) => choice && choice.next_event_id === "hall_idle_flavor_event");
    if (!hasFlavorChoice) {
      entranceEvent.choices.push({
        text: "霧の音に耳を澄ませる",
        effects: {
          add_time: { minutes: 1 }
        },
        next_event_id: "hall_idle_flavor_event"
      });
    }
  }

  if (!events.hall_idle_flavor_event) {
    events.hall_idle_flavor_event = {
      title: "玄関ホールの空気",
      event_type: "spot_event",
      spot_id: "entrance_hall",
      participants: ["holmes"],
      text: [
        "扉の隙間を打つ霧の音だけが、屋敷の沈黙に細く混じっている。",
        "今すぐ役に立つ情報ではない。だが、この家全体がゆっくりと呼吸しているような不穏さだけは確かに感じられた。"
      ],
      choices: [
        {
          text: "玄関ホールへ戻る",
          next_event_id: "entrance_hall_event"
        }
      ]
    };
  }

  return sample;
}

configureHolmesSampleEventOwnership(window.HOLMES_SAMPLE_SCENARIO);
window.HOLMES_PROMPT_SAMPLE_JSON = JSON.stringify(window.HOLMES_SAMPLE_SCENARIO, null, 2);

window.HOLMES_SAMPLE_REGISTRY.push({
  id: "holmes_escape_world",
  title: "ホームズ: ワールド併用型",
  data: window.HOLMES_SAMPLE_SCENARIO
});

window.HOLMES_SAMPLE_REGISTRY.push({
  id: "holmes_escape_scenario_only",
  title: "ホームズ: シナリオ主導型",
  data: (() => {
    const sample = JSON.parse(JSON.stringify(window.HOLMES_SAMPLE_SCENARIO));
    const scenarioId = typeof sample.initial_state?.active_scenario_id === "string" && sample.initial_state.active_scenario_id.trim()
      ? sample.initial_state.active_scenario_id.trim()
      : "main_scenario";
    const scenarioDef = sample.scenarios?.[scenarioId] || sample.scenario || {};

    scenarioDef.overlay = scenarioDef.overlay || {};
    scenarioDef.overlay.add_areas = JSON.parse(JSON.stringify(sample.world?.areas || {}));
    scenarioDef.overlay.add_dungeons = JSON.parse(JSON.stringify(sample.world?.dungeons || {}));
    scenarioDef.overlay.add_spots = JSON.parse(JSON.stringify(sample.world?.spots || {}));
    scenarioDef.overlay.add_characters = JSON.parse(JSON.stringify(sample.definitions?.characters || {}));
    scenarioDef.overlay.add_items = JSON.parse(JSON.stringify(sample.definitions?.items || {}));

    sample.title = `${sample.title}（シナリオ主導型）`;
    sample.world = sample.world || {};
    sample.world.areas = {};
    sample.world.dungeons = {};
    sample.world.spots = {};
    sample.world.base_events = {};
    sample.definitions = sample.definitions || {};
    sample.definitions.characters = {};
    sample.definitions.items = {};

    if (!sample.scenarios) {
      sample.scenarios = {};
    }
    sample.scenarios[scenarioId] = scenarioDef;
    delete sample.scenario;

    return sample;
  })()
});
