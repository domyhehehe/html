---

# 汎用サウンドノベルJSONランナー 改修計画書

## 1. 改修の目的

現行ランナーは、`scenario.events` を主系として進行し、各 event の `choices` や `actions` で移動・進行・分岐を表現する構造になっている。この方式は単発シナリオの実装には向くが、同一 world 上で複数 scenario を切り替えながら利用するには、以下の問題がある。

1. 通常移動とシナリオ固有遷移が choice に混在している。
2. `world.spots.connections` が地理情報として存在していても、実行時の主役になっていない。
3. `current_spot_id` と `characters[player].spot_id` が二重管理となっている。
4. scenario が world に対して制約・差分・追加を与える仕組みが弱い。
5. 平時イベントと非常時イベントの切り替えがしにくい。
6. シナリオ限定スポット・キャラクター・アイテム・フラグの管理が曖昧である。

本改修では、world をベース世界、scenario をその世界状態に差分を与えるレイヤー、event を最終表示される体験単位として再定義し、探索型ADV・シミュレーション寄りの表現力を強化する。

---

## 2. 改修の基本方針

改修は一括全面刷新ではなく、**後方互換を維持した段階的移行**とする。既存 JSON が可能な限りそのまま動くことを優先しつつ、新ルールを上乗せする。

基本方針は以下の通りとする。

* world は地理・常設素材の定義を担う。
* scenario は world に対する制約・追加・上書きを担う。
* event は「その場所、その状態で、実際に見える内容」を担う。
* 通常移動は `world.spots.connections` を基礎に自動生成する。
* choice は特殊移動・物語分岐・会話選択などに寄せる。
* プレイヤー位置の正本は `characters[player_character_id].spot_id` に寄せる。
* 平時イベントと scenario イベントを合成・停止・上書きできる仕組みを導入する。

---

## 3. 現行仕様の改修対象

### 3.1 データモデル

現行の top-level 構造 `definitions / world / scenario / initial_state` は維持する。
ただし scenario に以下の新規責務を追加する。

* 通常移動制限
* world 差分追加
* 定常イベントの停止/併用/上書き
* scenario専用資産の保持

### 3.2 ランタイム

現行は `current_event_id` 主導であるが、今後は `characters[player].spot_id` を基準に「現在地 → 利用可能イベント解決」の流れへ徐々に寄せる。

### 3.3 UI

選択肢一覧の中に通常移動が混ざっている状態を改め、将来的に「移動」と「行動/選択」を表示上でも分離する。

---

## 4. 改修スコープ

本改修のスコープは以下とする。

### スコープ内

* movement_rules の導入
* プレイヤー位置管理の一本化準備
* 通常移動の自動生成
* scenario 差分レイヤーの導入
* event 合成ルールの導入
* サンプルJSONの新仕様対応
* バリデーションの新仕様対応
* 続篇プロンプト・状態コピーの整合性調整

### スコープ外

* セーブ/ロードの永続化方式の刷新
* 戦闘システムの導入
* 複数プレイヤー同時操作
* ネットワーク同期
* UIデザインの全面リニューアル

---

## 5. 改修後の目標アーキテクチャ

改修後の概念構造は以下とする。

`world`
→ 地理・常設スポット・常設キャラ・常設アイテム・定常イベント

`scenario`
→ world への制約、差分、追加、無効化、ローカル状態

`resolved view`
→ 現在の player.spot_id / flags / scenario差分を反映した最終表示内容

`event`
→ 実際に本文・action・choice としてプレイヤーに提示されるもの

---

## 6. 改修フェーズ

# フェーズ1：通常移動の導入と互換確保

## 目的

choice直書きの移動から脱却し、`world.spots.connections` を使った通常移動を実装する。

## 実施内容

1. `scenario.movement_rules` を追加する。
2. 現在地の `connections` を読み、自動的に通常移動ボタンを生成する。
3. area / dungeon / spot 単位の制限を movement_rules で判定する。
4. choice 内の既存移動は当面残すが、サンプルJSONでは徐々に削減する。
5. UI上で通常移動と action/choice を表示上区別できるよう準備する。

## 成果物

* movement_rules 解釈ロジック
* 通常移動自動生成関数
* movement_rules 用バリデーション
* movement_rules 対応サンプルシナリオ

## 完了条件

* current spot の `connections` に応じて通常移動が表示される
* scenario によって移動先が制限される
* 既存 choice ベース移動 JSON も動作継続する

---

# フェーズ2：位置管理の一本化

## 目的

`current_spot_id` と `characters[player].spot_id` の二重管理を解消し、位置管理の正本を一本化する。

## 実施内容

1. プレイヤー位置の正本を `characters[player_character_id].spot_id` と定義する。
2. `current_spot_id` は互換用または表示キャッシュ扱いにする。
3. すべての移動処理を `moveCharacterToSpot(characterId, spotId)` 経由に統一する。
4. 現在地の取得関数を `player.spot_id` 基準に差し替える。
5. `enterEvent()` の中で spot を event に合わせてセットする処理を縮小し、「場所が決まってから event を解決する」方向へ寄せる。

## 成果物

* 位置管理ユーティリティ群の改修
* spot解決順序の整理
* current_spot_id 依存箇所の洗い出しと縮小

## 完了条件

* プレイヤー現在地の正本が1箇所になる
* 通常移動・特殊移動・イベント遷移すべてで位置矛盾が起きない

---

# フェーズ3：scenario差分レイヤーの導入

## 目的

scenario を単なる event 集ではなく、world の見え方を支配する差分レイヤーとして拡張する。

## 実施内容

1. `scenario.overlay` を追加する。
2. overlay で以下を扱えるようにする。

   * `disabled_spot_ids`
   * `enabled_spot_ids`
   * `add_areas`
   * `add_dungeons`
   * `add_spots`
   * `add_characters`
   * `add_items`
   * `local_flags`
3. ランタイム上で `world + overlay` の解決結果を取得する resolver を作る。
4. scenario専用キャラ・アイテム・spot を読み込めるようにする。
5. 続篇用状態コピーや初期状態ロード時に overlay を考慮する。

## 成果物

* overlay 解決ロジック
* scenario専用資産対応
* overlay バリデーション

## 完了条件

* scenario によって存在/非存在が切り替わる spot を表現できる
* scenario専用キャラ・アイテムを問題なく扱える

---

# フェーズ4：定常イベントとシナリオイベントの分離

## 目的

平時イベントと scenario専用イベントを分離し、「共存」「停止」「上書き」を実現する。

## 実施内容

1. `world.base_events` を追加する。
2. `scenario.event_rules` を追加する。
3. event 解決モードとして以下を導入する。

   * `base_only`
   * `scenario_only`
   * `merge`
   * `disable_all`
4. 현재 spot に応じて base_events と scenario.events を合成する resolver を実装する。
5. ゾンビパニック/人探しのような差異をサンプルで再現する。

## 成果物

* base_events モデル
* event_rules モデル
* イベント解決ロジック
* 合成イベント対応サンプル

## 完了条件

* 同一 spot で scenario に応じて平時イベントが消えたり残ったりする
* scenario が平時イベントを完全停止できる
* scenario が平時イベントに上乗せできる

---

# フェーズ5：UI整理

## 目的

内部構造の改修に合わせて、プレイヤーが「何が移動で何が行動か」を直感的に理解できるUIへ整える。

## 実施内容

1. 通常移動一覧を専用セクションで表示する。
2. action / choice は別セクションに分ける。
3. disabled の理由を通常移動にも表示できるようにする。
4. 「この spot では定常イベントのみ」「scenarioイベントのみ」などの内部状態に応じた表示方針を整理する。
5. 状態表示パネルに scenario overlay 由来の制約情報を追加してもよい。

## 成果物

* UI分離版レイアウト
* 移動/行動の表示ルール
* disabled_message の整理

## 完了条件

* プレイヤーが通常移動と物語選択を見分けられる
* シナリオ制約の存在がUI上で破綻しない

---

## 7. データ仕様改修案

### 7.1 追加予定フィールド

#### scenario.movement_rules

通常移動制限定義

#### scenario.overlay

world差分定義

#### world.base_events

定常イベント定義

#### scenario.event_rules

定常イベントとシナリオイベントの解決モード定義

---

## 8. サンプルシナリオ改修方針

ホームズサンプルは改修対象とし、以下の方針で書き換える。

1. 書斎・地下階段・温室などへの通常移動は `connections` に基づく自動移動へ寄せる。
2. event.choice から単純移動を減らし、物語的意味を持つ choice に絞る。
3. hidden_passage や back_exit は movement_rules や flags による解放対象とする。
4. 将来的には `world.base_events` に平時イベントを定義し、scenario.events との分離見本にする。
5. 「平時の邸宅探索」と「事件発生中の邸宅探索」を分けられる構造を意識する。

---

## 9. 影響範囲

影響を受ける主要コンポーネントは以下。

* `enterEvent()`
* `renderOptions()`
* `buildOptionButton()`
* `renderScreen()`
* `startScript()`
* 状態要約表示
* 続篇用状態コピー
* JSONバリデーション群
* サンプルJSON生成プロンプト
* AI用説明文

特に `current_event_id` と `current_spot_id` の扱いは、複数箇所に波及するため注意して改修する。

---

## 10. リスクと対策

### リスク1：既存JSONの互換性崩壊

**対策**
既存の `scenario.events` と `choice遷移` は当面維持し、新フィールドがある場合のみ新ルールを適用する。

### リスク2：位置管理の二重化バグ

**対策**
プレイヤー位置の更新を必ず共通関数経由にし、デバッグログに移動履歴を出す。

### リスク3：event解決の複雑化

**対策**
resolver を関数分割し、`resolveWorldView` `resolveAvailableMoves` `resolveVisibleEvents` の三段に分ける。

### リスク4：JSON仕様の肥大化

**対策**
まずは最小キーのみ導入し、詳細オプションは後から追加する。最初から万能怪獣を作らない。

---

## 11. 実装優先順位

改修優先順位は以下とする。

**最優先**

1. movement_rules
2. 通常移動自動生成
3. プレイヤー位置管理の統一準備

**中優先**
4. overlay
5. scenario専用spot/character/item
6. UI上の移動/行動分離

**後優先**
7. base_events
8. event_rules
9. 平時/非常時のイベント合成本格対応

---

## 12. マイルストーン

### M1

通常移動が `connections` から表示され、scenario で制限できる

### M2

プレイヤー位置の正本が `characters[player].spot_id` に寄る

### M3

scenario が spot / character / item を追加・停止できる

### M4

平時イベントとシナリオイベントを切り替え・共存できる

### M5

サンプルJSONとUIが新思想に揃う

---

## 13. 最終到達像

最終的には、本ランナーを「固定されたノベル再生機」ではなく、**同一 world 上で複数 scenario を差し替えながら遊べる探索型シナリオランナー**へ進化させる。
プレイヤーは spot を移動し、scenario によって変質した world を探索し、その場の state に応じて event を体験する。
これにより、「平時の街」「事件中の街」「崩壊後の街」といった異なる世界状態を、同じベース world から再構成できるようになる。
