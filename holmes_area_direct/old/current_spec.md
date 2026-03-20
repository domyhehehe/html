# 現在仕様メモ

このファイルは `holmes_area_direct` の現状実装に合わせた仕様メモです。設計案ではなく、今の `index.html` / `assets/js/app.js` / `assets/js/data/*.js` に沿った実装状態を整理しています。

## 1. 構成

- エントリーポイントは `index.html`
- 実行ロジックは `assets/js/app.js`
- サンプル本体は `assets/js/data/sample-scenario.js`
- サンプル一覧は `assets/js/data/samples.js`
- AI用プロンプトは `assets/js/prompts/generic.js` と `assets/js/prompts/shindo.js`

読み込み順は以下です。

1. `sample-scenario.js`
2. `samples.js`
3. `generic.js`
4. `shindo.js`
5. `app.js`

## 2. 現在のJSONトップレベル

現在の標準形は以下です。

```json
{
  "title": "string",
  "version": "string",
  "definitions": {
    "characters": {},
    "items": {}
  },
  "world": {
    "areas": {},
    "dungeons": {},
    "spots": {},
    "base_events": {}
  },
  "scenarios": {},
  "quests": {},
  "initial_state": {}
}
```

### 2.1 互換入力

以下の旧形式も受理します。

- top-level `scenario`
- `scenario.quests`
- `initial_state.current_quest_id`

読み込み時に `normalizeScriptStructure()` が以下のように正規化します。

- 旧 `scenario` は `scenarios` の1件に変換する
- `scenario.quests` は top-level `quests` に引き上げる
- `current_quest_id` は `active_quest_ids` と `primary_quest_id` に同期する

## 3. world / scenario / quest の責務

### 3.1 world

`world` は常設の定義です。

- `areas`
- `dungeons`
- `spots`
- `base_events`

ただし現在実装では、これらが空でも動作できます。active scenario の `overlay.add_*` に定義があれば、そちらで補えます。

### 3.2 scenario

`scenario` は world に差分を与えるレイヤーです。実際に効くのは `initial_state.active_scenario_id` で選ばれた1件だけです。

主に使うキー:

- `events`
- `start_event_id`
- `game_over_event_id`
- `movement_rules`
- `event_rules`
- `overlay`

`overlay` で現在使えるキー:

- `disabled_spot_ids`
- `enabled_spot_ids`
- `add_areas`
- `add_dungeons`
- `add_spots`
- `add_characters`
- `add_items`
- `local_flags`

### 3.3 quest

`quest` は目標や進行管理の単位です。world を直接変える責務は持ちません。

現在想定しているキー:

- `title`
- `description`
- `related_scenario_ids`
- `restrictions`
- `completion`

状態側で管理するキー:

- `active_quest_ids`
- `primary_quest_id`
- `quest_states`

## 4. initial_state

現在使っている主要キー:

- `player_character_id`
- `active_scenario_id`
- `active_quest_ids`
- `primary_quest_id`
- `quest_states`
- `current_quest_id`
- `current_event_id`
- `current_spot_id`
- `time`
- `flags`
- `unique`
- `characters`
- `spot_states`

補足:

- 位置の正本は `characters[player_character_id].spot_id`
- `current_spot_id` は互換用と表示用の同期先
- `current_event_id` は現在表示中の event のキャッシュ寄りの扱い

## 5. ランタイム解決

### 5.1 active scenario

active scenario は `initial_state.active_scenario_id` で決まります。

- active scenario があるときだけ `overlay` / `movement_rules` / `event_rules` / `events` を適用
- active scenario がなければ `world.base_events` を中心に動作

### 5.2 world + overlay の合成

実行時は以下の accessor で world と active scenario の overlay を合成します。

- `getRuntimeAreaDefinitions()`
- `getRuntimeDungeonDefinitions()`
- `getRuntimeSpotDefinitions()`
- `getRuntimeCharacterDefinitions()`
- `getRuntimeItemDefinitions()`

合成順は概ね以下です。

1. `world` / `definitions` の常設定義
2. active scenario の `overlay.add_*`
3. `overlay.disabled_spot_ids` に該当する spot の除外

## 6. event 解決

### 6.1 base event と scenario event

event 解決は spot ベースです。`resolveVisibleEvents(spotId)` で現在 spot に見える event 群を集めます。

`event_rules.mode` は以下を扱います。

- `base_only`
- `scenario_only`
- `merge`
- `disable_all`

### 6.2 優先順

`merge` のときは scenario event を base event より優先します。つまり同じ spot に両方ある場合、scenario 側が前に来ます。

`getCurrentEvent()` の挙動は以下です。

1. `current_event_id` が現在 spot に対して妥当ならそれを使う
2. そうでなければ現在 spot の visible event の先頭を使う

## 7. 移動仕様

### 7.1 通常移動

通常移動は `world.spots[spotId].connections` を基礎に自動生成します。scenario 主導型では `overlay.add_spots` 内の `connections` でも動きます。

生成関数:

- `getNormalMoves(eventDef)`

現在の仕様:

- `movement_rules` による許可判定を通った移動だけ出す
- 表示位置は本文下の `choiceList` の末尾
- 独立した「移動」欄は使わない

### 7.2 event 側のスポット移動

`actions` / `choices` 側にも spot 移動を持てます。エンジンは以下の順で target spot を推定します。

1. `option.target_spot_id`
2. `effects.set.characters.<player>.spot_id`
3. `effects.set.current_spot_id`

### 7.3 重複排除

現在の event に、ある target spot への明示的な移動 option がある場合、同じ target spot への通常移動は自動生成しません。

目的は以下です。

- 単純移動とシナリオ固有の移動 choice の二重表示を避ける
- 「通常移動」と「イベント移動」の役割衝突を減らす

### 7.4 移動後の進行

option 実行後の遷移規則は以下です。

1. `next_event_id` が文字列ならその event に遷移
2. それ以外で player spot が変わったら、移動先 spot の visible event を解決して遷移
3. spot が変わっていなければ現在 event を再表示
4. `next_event_id === null` だけでは即終端にしない
5. 終端扱いにするのは current event が `ending` または `game_over` 系のときだけ

そのため、通常移動で story が即終了する挙動は現行では抑止されています。

## 8. movement_rules

現在よく使うキー:

- `default.forbidden_spot_ids`
- `default.allowed_area_ids`
- `default.allowed_dungeon_ids`
- `conditional[].conditions`
- `conditional[].allow_spot_ids`

判定時は target spot を起点に area / dungeon を引いて許可を見ます。

## 9. scenario 主導型JSON

現在の実装では、`world` がほぼ空でも動作できます。つまり以下のような構成が可能です。

```json
{
  "definitions": {
    "characters": {},
    "items": {}
  },
  "world": {
    "areas": {},
    "dungeons": {},
    "spots": {},
    "base_events": {}
  },
  "scenarios": {
    "main": {
      "overlay": {
        "add_areas": {},
        "add_dungeons": {},
        "add_spots": {},
        "add_characters": {},
        "add_items": {}
      },
      "events": {}
    }
  },
  "initial_state": {
    "active_scenario_id": "main"
  }
}
```

つまり同じランナーで次の2系統を扱えます。

- world 併用型
- scenario 主導型

## 10. validation の現状

主な検証対象:

- top-level 構造
- `world`
- `initial_state`
- `quests`
- `scenario.events`
- `conditions` / `effects` / option の参照整合

現状の特徴:

- `world.spots` が空でも、active scenario の `overlay.add_spots` に1件以上あれば通る
- event / character / item / spot の参照チェックは active scenario overlay を加味した定義で行う
- `initial_state.active_scenario_id` と `primary_quest_id` は存在確認する

## 11. サンプル管理

UI には `#sampleSelect` があり、複数サンプルを選べます。

対応ロジック:

- `getAvailableSamples()`
- `populateSampleOptions()`
- `loadExampleIntoTextarea()`

入力元:

- `window.HOLMES_SAMPLE_SCENARIO`
- `window.HOLMES_SAMPLE_REGISTRY`

現状のサンプル:

- `ホームズ: ワールド併用型`
- `ホームズ: シナリオ主導型`

後者は `samples.js` 側で、元サンプルを複製しつつ `world` の area / dungeon / spot / character / item を active scenario の `overlay.add_*` に移し替えて生成しています。

## 12. UI の現在仕様

`index.html` の主要表示:

- 通知
- セットアップ
- 進行
- 状態
- 本文
- ログ

現在は独立した「移動」カードはありません。通常移動も event choice も、最終的に本文カード内の `choiceList` に集約されます。

## 13. 既知の簡略化

現状は以下を簡略化しています。

- active scenario は同時に1件のみ
- quest は複数保持できるが、world を直接書き換えない
- quest と scenario の連動は参照ベースで、強い自動制御はまだ薄い
- scenario ごとの細かい移動表示モード切替までは未整理

## 14. 関連ファイル

- `holmes_area_direct/index.html`
- `holmes_area_direct/assets/js/app.js`
- `holmes_area_direct/assets/js/data/sample-scenario.js`
- `holmes_area_direct/assets/js/data/samples.js`
- `holmes_area_direct/assets/js/prompts/generic.js`
- `holmes_area_direct/assets/js/prompts/shindo.js`
