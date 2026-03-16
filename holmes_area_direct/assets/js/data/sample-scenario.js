window.HOLMES_SAMPLE_SCENARIO = {
  "title": "ベイカー街の密室からの脱出",
  "version": "2.1",
  "definitions": {
    "characters": {
      "holmes": {
        "name": "シャーロック・ホームズ",
        "tags": ["player", "human", "detective"],
        "base_stats": {
          "体力": 60,
          "推理力": 8
        },
        "description": "封鎖された邸宅に閉じ込められた名探偵。冷静な観察眼で脱出路を探す。"
      },
      "watson": {
        "name": "ワトスン",
        "tags": ["npc", "ally", "doctor"],
        "base_stats": {
          "体力": 55,
          "医学知識": 6
        },
        "description": "ホームズの相棒。邸宅内を独立して調査し、ヒントをもたらす。"
      }
    },
    "items": {
      "brass_key": {
        "name": "真鍮の鍵",
        "item_type": "key",
        "tags": ["quest", "unlock"],
        "description": "地下室への扉に対応する古い真鍮製の鍵。",
        "stackable": false,
        "consumable": false
      },
      "cipher_note": {
        "name": "暗号メモ",
        "item_type": "document",
        "tags": ["clue", "cipher"],
        "description": "書斎で発見された暗号文。解読すれば隠し通路の仕掛けがわかる。",
        "stackable": false,
        "consumable": false
      },
      "iron_bar": {
        "name": "鉄の棒",
        "item_type": "tool",
        "tags": ["force", "pry"],
        "description": "温室の棚から外れた鉄製の支柱。こじ開けに使えそうだ。",
        "stackable": false,
        "consumable": true
      }
    }
  },
  "world": {
    "settings": {
      "genre": "mystery_escape",
      "default_language": "ja"
    },
    "time_system": {
      "calendar_type": "gregorian",
      "default_timezone": "Europe/London",
      "turn_unit": "minute",
      "minutes_per_turn": 5
    },
    "areas": {
      "sealed_manor": {
        "name": "封鎖されたモラン邸",
        "description": "ロンドン郊外、霧に包まれた屋敷。内側から完全に封鎖されている。"
      }
    },
    "dungeons": {
      "moran_manor": {
        "name": "モラン邸",
        "area_id": "sealed_manor",
        "type": "manor",
        "description": "三階建ての石造り邸宅。犯罪組織の拠点として使われていた疑惑がある。"
      }
    },
    "spots": {
      "entrance_hall": {
        "name": "玄関ホール",
        "area_id": "sealed_manor",
        "dungeon_id": "moran_manor",
        "spot_type": "entrance",
        "connections": ["study", "basement_stairs", "greenhouse"]
      },
      "study": {
        "name": "書斎",
        "area_id": "sealed_manor",
        "dungeon_id": "moran_manor",
        "spot_type": "room",
        "connections": ["entrance_hall", "hidden_passage"]
      },
      "basement_stairs": {
        "name": "地下への階段",
        "area_id": "sealed_manor",
        "dungeon_id": "moran_manor",
        "spot_type": "corridor",
        "connections": ["entrance_hall", "basement_vault"]
      },
      "basement_vault": {
        "name": "地下金庫室",
        "area_id": "sealed_manor",
        "dungeon_id": "moran_manor",
        "spot_type": "vault",
        "connections": ["basement_stairs", "hidden_passage"]
      },
      "hidden_passage": {
        "name": "隠し通路",
        "area_id": "sealed_manor",
        "dungeon_id": "moran_manor",
        "spot_type": "secret_room",
        "connections": ["study", "basement_vault", "greenhouse"]
      },
      "greenhouse": {
        "name": "温室",
        "area_id": "sealed_manor",
        "dungeon_id": "moran_manor",
        "spot_type": "room",
        "connections": ["entrance_hall", "hidden_passage", "back_exit"]
      },
      "back_exit": {
        "name": "裏口",
        "area_id": "sealed_manor",
        "dungeon_id": "moran_manor",
        "spot_type": "exit",
        "connections": ["greenhouse"]
      }
    },
    "base_events": {
      "entrance_hall_base": {
        "title": "玄関ホール（平時）",
        "event_type": "base_event",
        "spot_id": "entrance_hall",
        "text": [
          "平時の玄関ホール。静かな邸宅の入り口だ。"
        ],
        "actions": [
          {
            "text": "周囲を調べる",
            "effects": { "set_flags": ["investigated_entrance"] }
          }
        ]
      }
    }
  },
  "scenario": {
    "start_event_id": "entrance_hall_event",
    "game_over_event_id": "trapped_game_over_event",
    "quests": {
      "escape_manor": {
        "title": "モラン邸から脱出する",
        "description": "封鎖された邸宅から生還し、可能なら事件の全貌を解明する。",
        "restrictions": {
          "allowed_area_ids": ["sealed_manor"],
          "allowed_dungeon_ids": ["moran_manor"],
          "allowed_character_ids": ["holmes", "watson"],
          "allowed_event_ids": [
            "entrance_hall_event",
            "study_event",
            "basement_stairs_event",
            "basement_vault_event",
            "hidden_passage_event",
            "greenhouse_event",
            "normal_escape_end_event",
            "deduction_escape_end_event",
            "trapped_game_over_event"
          ]
        },
        "completion": {
          "required_any_flags": ["escaped_normal", "escaped_deduction"]
        }
      }
    },
    "movement_rules": {
      "default": {
        "allowed_area_ids": ["sealed_manor"],
        "allowed_dungeon_ids": ["moran_manor"],
        "forbidden_spot_ids": ["hidden_passage", "back_exit"]
      },
      "conditional": [
        {
          "conditions": {
            "required_flags": ["hidden_passage_open"]
          },
          "allow_spot_ids": ["hidden_passage"]
        },
        {
          "conditions": {
            "required_flags": ["back_door_forced"]
          },
          "allow_spot_ids": ["back_exit"]
        },
        {
          "conditions": {
            "required_flags": ["mechanism_activated"]
          },
          "allow_spot_ids": ["greenhouse"]
        }
      ]
    },
    "overlay": {
      "disabled_spot_ids": [],
      "enabled_spot_ids": [],
      "add_areas": {},
      "add_dungeons": {},
      "add_spots": {},
      "add_characters": {},
      "add_items": {},
      "local_flags": []
    },
    "event_rules": {
      "mode": "merge",
      "spot_overrides": {}
    },
    "events": {
      "entrance_hall_event": {
        "title": "玄関ホール",
        "event_type": "spot_event",
        "spot_id": "entrance_hall",
        "participants": ["holmes", "watson"],
        "text": [
          "モラン邸の玄関ホール。重厚な扉は外側から施錠され、脱出路が塞がれている。",
          "霧の中、遠くで警鐘の音がかすかに聞こえる。時間は多くない。"
        ],
        "conditional_texts": [
          {
            "conditions": {
              "required_character_spots": {"watson": ["entrance_hall"]},
              "forbidden_flags": ["watson_spoke_entrance"]
            },
            "text": [
              "ワトスンが何かに気づいた様子で辺りを見回している。話しかければ手がかりを教えてくれるかもしれない。"
            ]
          },
          {
            "conditions": {
              "required_character_spots": {"watson": ["entrance_hall"]},
              "required_flags": ["watson_spoke_entrance"]
            },
            "text": [
              "ワトスンが柱時計を調べている。『ホームズ、この時計……針が止まっています。何か意味があるのでは？』"
            ]
          },
          {
            "conditions": {
              "required_character_spots": {"watson": ["study"]}
            },
            "text": [
              "ワトスンは書斎に移動している。足跡が廊下に続いている。"
            ]
          },
          {
            "conditions": {
              "required_flags": ["clock_examined"]
            },
            "text": [
              "柱時計の針は午後11時47分で止まっている。事件発生時刻の手がかりだ。"
            ]
          },
          {
            "conditions": {
              "required_flags": ["brass_key_found"]
            },
            "text": [
              "真鍮の鍵を持っている。地下室への扉が開けられるはずだ。"
            ]
          },
          {
            "conditions": {
              "required_flags": ["cipher_decoded"]
            },
            "text": [
              "暗号の解読が済んでいる。隠し通路の仕掛けは『暖炉の左の燭台を引く』だ。"
            ]
          }
        ],
        "actions": [
          {
            "id": "talk_to_watson_at_entrance",
            "text": "ワトスンに話しかける",
            "conditions": {
              "required_character_spots": {"watson": ["entrance_hall"]},
              "forbidden_flags": ["watson_spoke_entrance"]
            },
            "effects": {
              "set_flags": ["watson_spoke_entrance"],
              "add_time": {"minutes": 2}
            },
            "success_message": "『ホームズ、この時計……針が止まっています。それと書斎の机にも妙なものがありそうです』ワトスンの指摘が手がかりを開いた。",
            "hidden_when_disabled": true
          },
          {
            "id": "examine_clock",
            "text": "柱時計を調べる",
            "conditions": {
              "required_flags": ["watson_spoke_entrance"],
              "forbidden_flags": ["clock_examined"]
            },
            "effects": {
              "add_items": [{"item_id": "brass_key", "quantity": 1}],
              "remove_spot_items": [{"spot_id": "entrance_hall", "item_id": "brass_key", "quantity": 1}],
              "set_flags": ["clock_examined", "brass_key_found"],
              "add_time": {"minutes": 5}
            },
            "success_message": "時計の文字盤裏に真鍮の鍵が隠されていた。ワトスンの観察眼は侮れない。",
            "hidden_when_disabled": true
          },
          {
            "id": "send_watson_to_study",
            "text": "ワトスンに書斎を先に調べてもらう",
            "conditions": {
              "required_character_spots": {"watson": ["entrance_hall"]}
            },
            "effects": {
              "set": {"characters.watson.spot_id": "study"},
              "add_time": {"minutes": 3}
            },
            "success_message": "ワトスンは書斎へ向かった。彼の医学的観察眼が何かを見つけるかもしれない。",
            "hidden_when_disabled": true
          },
          {
            "id": "deduce_at_hall",
            "text": "ホール全体を推理する",
            "conditions": {
              "required_flags": ["clock_examined"],
              "forbidden_flags": ["hall_deduced"]
            },
            "hidden_when_disabled": true,
            "effects": {
              "set_flags": ["hall_deduced"],
              "add": {"characters.holmes.current_stats.体力": -5},
              "add_time": {"minutes": 10}
            },
            "success_message": "『針の止まった時計、乱れた敷物、扉の鍵穴の傷……この邸宅には確かに何者かが仕掛けを施した』ホームズは確信した。"
          }
        ]
      },
      "study_event": {
        "title": "書斎",
        "event_type": "spot_event",
        "spot_id": "study",
        "participants": ["holmes", "watson"],
        "text": [
          "本棚に囲まれた書斎。机の上には無数の書類が散乱している。",
          "暖炉の火は消えており、灰の中に何かが燃やされた跡がある。"
        ],
        "conditional_texts": [
          {
            "conditions": {
              "required_character_spots": {"watson": ["study"]},
              "forbidden_flags": ["watson_spoke_study"]
            },
            "text": [
              "ワトスンが灰のそばで何かに気づいた様子だ。話しかければ手がかりを教えてくれるかもしれない。"
            ]
          },
          {
            "conditions": {
              "required_character_spots": {"watson": ["study"]},
              "required_flags": ["watson_spoke_study"]
            },
            "text": [
              "ワトスンが灰を調べている。『ホームズ、これは最近燃やされたものです。まだ温かい』"
            ]
          },
          {
            "conditions": {
              "required_flags": ["cipher_note_found"]
            },
            "text": [
              "暗号メモはすでに入手済みだ。"
            ]
          },
          {
            "conditions": {
              "required_flags": ["cipher_decoded"]
            },
            "text": [
              "暗号は解読済み。暖炉左の燭台を引けば隠し通路が開く。"
            ]
          },
          {
            "conditions": {
              "required_flags": ["hidden_passage_open"]
            },
            "text": [
              "暖炉脇の壁が開いており、隠し通路への入口が露出している。"
            ]
          }
        ],
        "actions": [
          {
            "id": "talk_to_watson_at_study",
            "text": "ワトスンに話しかける",
            "conditions": {
              "required_character_spots": {"watson": ["study"]},
              "forbidden_flags": ["watson_spoke_study"]
            },
            "effects": {
              "set_flags": ["watson_spoke_study"],
              "add_time": {"minutes": 2}
            },
            "success_message": "『ホームズ、灰はまだ温かい。そして机の書類の束……何かが隠されている気がします』ワトスンの指摘が手がかりを開いた。",
            "hidden_when_disabled": true
          },
          {
            "id": "search_desk",
            "text": "机の書類を調べる",
            "conditions": {
              "required_flags": ["watson_spoke_study"],
              "forbidden_flags": ["cipher_note_found"]
            },
            "effects": {
              "add_items": [{"item_id": "cipher_note", "quantity": 1}],
              "remove_spot_items": [{"spot_id": "study", "item_id": "cipher_note", "quantity": 1}],
              "set_flags": ["cipher_note_found"],
              "add_time": {"minutes": 5}
            },
            "success_message": "書類の束の奥に、折り畳まれた暗号メモを発見した。",
            "hidden_when_disabled": true
          },
          {
            "id": "decode_cipher",
            "text": "暗号メモを解読する",
            "conditions": {
              "required_items": [{"item_id": "cipher_note", "quantity": 1}],
              "min_unique": {"推理力": 7},
              "forbidden_flags": ["cipher_decoded"]
            },
            "effects": {
              "set_flags": ["cipher_decoded"],
              "add": {"characters.holmes.current_stats.体力": -5},
              "add_time": {"minutes": 10}
            },
            "success_message": "『なるほど……換字式暗号か。単純だが効果的だ』仕掛けの場所を特定した。",
            "failure_message": "暗号解読には高い推理力が必要だ。",
            "hidden_when_disabled": true
          },
          {
            "id": "pull_candlestick",
            "text": "暖炉左の燭台を引く",
            "conditions": {
              "required_flags": ["cipher_decoded"],
              "forbidden_flags": ["hidden_passage_open"]
            },
            "effects": {
              "set_flags": ["hidden_passage_open"],
              "add_time": {"minutes": 2}
            },
            "success_message": "ギィという音と共に壁が動き、隠し通路への入口が現れた。",
            "hidden_when_disabled": true
          },
          {
            "id": "recall_watson_to_entrance",
            "text": "ワトスンを玄関ホールへ戻す",
            "conditions": {
              "required_character_spots": {"watson": ["study"]}
            },
            "effects": {
              "set": {"characters.watson.spot_id": "entrance_hall"},
              "add_time": {"minutes": 2}
            },
            "success_message": "ワトスンは玄関ホールへ戻った。",
            "hidden_when_disabled": true
          }
        ]
      },
      "basement_stairs_event": {
        "title": "地下への階段",
        "event_type": "spot_event",
        "spot_id": "basement_stairs",
        "participants": ["holmes"],
        "text": [
          "石造りの急な階段が地下へ続いている。古びた鉄扉が行く手を遮っている。",
          "扉には真鍮製の錠前がかかっており、対応する鍵が必要だ。"
        ],
        "conditional_texts": [
          {
            "conditions": {
              "required_flags": ["brass_key_found"]
            },
            "text": [
              "真鍮の鍵を持っている。この錠前を開けられるはずだ。"
            ]
          },
          {
            "conditions": {
              "required_flags": ["basement_unlocked"]
            },
            "text": [
              "鉄扉はすでに解錠されている。地下金庫室へ通じている。"
            ]
          }
        ],
        "actions": [
          {
            "id": "unlock_basement",
            "text": "真鍮の鍵で鉄扉を開ける",
            "conditions": {
              "required_items": [{"item_id": "brass_key", "quantity": 1}],
              "forbidden_flags": ["basement_unlocked"]
            },
            "effects": {
              "set_flags": ["basement_unlocked"],
              "add_time": {"minutes": 2}
            },
            "success_message": "錠前が外れ、鉄扉が軋みながら開いた。",
            "hidden_when_disabled": true
          }
        ]
      },
      "basement_vault_event": {
        "title": "地下金庫室",
        "event_type": "spot_event",
        "spot_id": "basement_vault",
        "participants": ["holmes"],
        "text": [
          "地下の金庫室。棚には犯罪組織の記録と思しき書類が並んでいる。",
          "奥の壁に隠し通路と合流するらしき扉の輪郭が見える。"
        ],
        "conditional_texts": [
          {
            "conditions": {
              "required_flags": ["vault_searched"]
            },
            "text": [
              "金庫室はすでに調べ終えた。証拠書類の内容は記憶に刻まれている。"
            ]
          },
          {
            "conditions": {
              "required_flags": ["evidence_collected"]
            },
            "text": [
              "犯罪組織の全容を示す証拠を手に入れた。これがあれば脱出後にレストレード警部へ渡せる。"
            ]
          },
          {
            "conditions": {
              "required_flags": ["hidden_passage_open"]
            },
            "text": [
              "書斎側からも通路が開いている。隠し通路を通れば書斎へ抜けられる。"
            ]
          }
        ],
        "actions": [
          {
            "id": "search_vault",
            "text": "金庫室の書類を調査する",
            "conditions": {
              "forbidden_flags": ["vault_searched"]
            },
            "effects": {
              "set_flags": ["vault_searched"],
              "add": {"characters.holmes.current_stats.体力": -10},
              "add_time": {"minutes": 15}
            },
            "success_message": "『これは……モラン大佐が直接指揮した犯罪の記録だ。証拠として充分すぎる』",
            "hidden_when_disabled": true
          },
          {
            "id": "collect_evidence",
            "text": "証拠書類を手に取る",
            "conditions": {
              "required_flags": ["vault_searched"],
              "forbidden_flags": ["evidence_collected"]
            },
            "effects": {
              "set_flags": ["evidence_collected"],
              "add_time": {"minutes": 5}
            },
            "success_message": "証拠書類を懐に収めた。この脱出は単なる逃走ではなく、事件解決に繋がる。",
            "hidden_when_disabled": true
          }
        ]
      },
      "hidden_passage_event": {
        "title": "隠し通路",
        "event_type": "spot_event",
        "spot_id": "hidden_passage",
        "participants": ["holmes"],
        "text": [
          "埃っぽい隠し通路。書斎・地下金庫室・温室の三方に繋がっている。",
          "壁面には古い機構が並んでおり、どれかを操作すれば何かが起きそうだ。"
        ],
        "conditional_texts": [
          {
            "conditions": {
              "required_flags": ["mechanism_activated"]
            },
            "text": [
              "機構はすでに作動している。温室側の扉が開いているはずだ。"
            ]
          },
          {
            "conditions": {
              "required_flags": ["hall_deduced", "cipher_decoded"]
            },
            "text": [
              "ホールの観察と暗号解読を経て、ホームズの頭の中で事件の全構図が繋がりつつある。"
            ]
          }
        ],
        "actions": [
          {
            "id": "activate_mechanism",
            "text": "壁面の機構を操作する",
            "conditions": {
              "required_flags": ["cipher_decoded"],
              "forbidden_flags": ["mechanism_activated"]
            },
            "effects": {
              "set_flags": ["mechanism_activated"],
              "add_time": {"minutes": 5}
            },
            "success_message": "暗号の知識を活かし機構を正確に操作した。温室側の扉が開く音がした。",
            "hidden_when_disabled": true
          },
          {
            "id": "full_deduction",
            "text": "通路で事件の全貌を推理する",
            "conditions": {
              "required_flags": ["hall_deduced", "vault_searched", "cipher_decoded"],
              "forbidden_flags": ["case_solved"]
            },
            "effects": {
              "set_flags": ["case_solved"],
              "add": {"characters.holmes.current_stats.体力": -10},
              "add_time": {"minutes": 10}
            },
            "success_message": "『すべての断片が一致した。モラン大佐は自ら封鎖し、証拠を焼却しようとした。しかし時計が止まった時刻が彼のアリバイを崩す』完全な推理が完成した。",
            "hidden_when_disabled": true
          }
        ]
      },
      "greenhouse_event": {
        "title": "温室",
        "event_type": "spot_event",
        "spot_id": "greenhouse",
        "participants": ["holmes"],
        "text": [
          "霧に霞む温室。ガラス張りの天井から月光が差し込んでいる。",
          "植物の棚が倒れており、その下に裏口へ続く通路が顔を出している。"
        ],
        "conditional_texts": [
          {
            "conditions": {
              "required_flags": ["iron_bar_found"]
            },
            "text": [
              "鉄の棒を持っている。倒れた棚を動かしてより確実に通路を開けられる。"
            ]
          },
          {
            "conditions": {
              "required_flags": ["back_door_forced"]
            },
            "text": [
              "裏口の板は外されている。いつでも外へ出られる。"
            ]
          },
          {
            "conditions": {
              "required_flags": ["case_solved"]
            },
            "text": [
              "事件の全貌を解明したホームズの目には、この温室の痕跡もすべて意味を持って見える。"
            ]
          }
        ],
        "actions": [
          {
            "id": "pick_up_iron_bar",
            "text": "棚から外れた鉄の支柱を拾う",
            "conditions": {
              "forbidden_flags": ["iron_bar_found"]
            },
            "effects": {
              "add_items": [{"item_id": "iron_bar", "quantity": 1}],
              "remove_spot_items": [{"spot_id": "greenhouse", "item_id": "iron_bar", "quantity": 1}],
              "set_flags": ["iron_bar_found"],
              "add_time": {"minutes": 2}
            },
            "success_message": "鉄の棒を拾い上げた。こじ開けに使えそうだ。",
            "hidden_when_disabled": true
          },
          {
            "id": "force_back_door",
            "text": "鉄の棒で裏口の板をこじ開ける",
            "conditions": {
              "required_items": [{"item_id": "iron_bar", "quantity": 1}],
              "forbidden_flags": ["back_door_forced"]
            },
            "effects": {
              "set_flags": ["back_door_forced"],
              "add_time": {"minutes": 5}
            },
            "success_message": "板が外れ、裏口の向こうに夜のロンドンが見えた。",
            "hidden_when_disabled": true
          }
        ],
        "choices": [
          {
            "text": "裏口から脱出する（通常脱出）",
            "conditions": {
              "required_flags": ["back_door_forced"]
            },
            "disabled_text": "裏口の板が塞がっていて出られない",
            "failure_message": "裏口の板を外す道具が必要だ。",
            "effects": {
              "set_flags": ["escaped_normal"],
              "set": {
                "current_spot_id": "back_exit",
                "characters.holmes.spot_id": "back_exit",
                "characters.watson.spot_id": "back_exit"
              },
              "add_time": {"minutes": 3}
            },
            "next_event_id": "normal_escape_end_event"
          },
          {
            "text": "証拠を持って事件解決の上で脱出する",
            "conditions": {
              "required_flags": ["back_door_forced", "case_solved", "evidence_collected"]
            },
            "disabled_text": "事件の全貌解明と証拠収集が揃えばここから完全勝利脱出できる",
            "failure_message": "推理の完成・証拠収集・裏口の解放がすべて必要だ。",
            "effects": {
              "set_flags": ["escaped_deduction"],
              "set": {
                "current_spot_id": "back_exit",
                "characters.holmes.spot_id": "back_exit",
                "characters.watson.spot_id": "back_exit"
              },
              "add_time": {"minutes": 3}
            },
            "next_event_id": "deduction_escape_end_event"
          },
          {
            "text": "玄関ホールへ戻る",
            "effects": {
              "set": {
                "current_spot_id": "entrance_hall",
                "characters.holmes.spot_id": "entrance_hall"
              },
              "add_time": {"minutes": 4}
            },
            "next_event_id": "entrance_hall_event"
          }
        ]
      },
      "normal_escape_end_event": {
        "title": "脱出成功",
        "event_type": "ending",
        "spot_id": "back_exit",
        "participants": ["holmes", "watson"],
        "text": [
          "裏口から霧のロンドンへ踏み出した。背後でモラン邸の窓が一つ、ゆっくりと暗くなった。",
          "ワトスンが追いつき、肩を並べて夜道を歩く。『無事でよかった、ホームズ』",
          "事件の記録は後日レストレード警部に委ねることになる。今夜は脱出で精一杯だった。"
        ],
        "choices": [
          {
            "text": "完",
            "next_event_id": null
          }
        ]
      },
      "deduction_escape_end_event": {
        "title": "完全解決エンド",
        "event_type": "ending",
        "spot_id": "back_exit",
        "participants": ["holmes", "watson"],
        "text": [
          "証拠書類を懐に、ホームズは霧のロンドンへ踏み出した。",
          "『ワトスン、モラン大佐の逮捕令状を出す根拠はすべて揃った』",
          "翌朝、スコットランド・ヤードにすべての証拠と完全な推理書が届けられた。",
          "ベイカー街の密室事件は、シャーロック・ホームズの最も鮮やかな仕事として記録された。"
        ],
        "choices": [
          {
            "text": "完全解決エンド",
            "next_event_id": null
          }
        ]
      },
      "trapped_game_over_event": {
        "title": "邸宅に閉じ込められて",
        "event_type": "game_over",
        "participants": ["holmes"],
        "text": [
          "体力の限界を超え、ホームズの足が止まった。",
          "霧の中で警鐘が鳴り続ける。封鎖された邸宅の中で、意識が遠のいていく。",
          "『……しくじった』それが最後の言葉だった。"
        ],
        "choices": [
          {
            "text": "最初からやり直す",
            "next_event_id": null
          }
        ]
      }
    }
  },
  "initial_state": {
    "player_character_id": "holmes",
    "current_quest_id": "escape_manor",
    "current_event_id": "entrance_hall_event",
    "time": {
      "year": 1895,
      "month": 11,
      "day": 3,
      "hour": 23,
      "minute": 50,
      "turn": 0
    },
    "flags": [],
    "unique": {
      "推理力": 8
    },
    "characters": {
      "holmes": {
        "spot_id": "entrance_hall",
        "status": "active",
        "current_stats": {
          "体力": 60
        },
        "inventory": [],
        "relationships": {
          "watson": {
            "trust": 5
          }
        }
      },
      "watson": {
        "spot_id": "entrance_hall",
        "status": "active",
        "current_stats": {
          "体力": 55,
          "医学知識": 6
        },
        "inventory": [],
        "relationships": {
          "holmes": {
            "trust": 5
          }
        }
      }
    },
    "spot_states": {
      "entrance_hall": {
        "items": [
          {
            "item_id": "brass_key",
            "quantity": 1,
            "container_id": "grandfather_clock"
          }
        ]
      },
      "study": {
        "items": [
          {
            "item_id": "cipher_note",
            "quantity": 1,
            "container_id": "desk_papers"
          }
        ]
      },
      "greenhouse": {
        "items": [
          {
            "item_id": "iron_bar",
            "quantity": 1,
            "container_id": "fallen_shelf"
          }
        ]
      }
    }
  }
};

window.HOLMES_PROMPT_SAMPLE_JSON = JSON.stringify(window.HOLMES_SAMPLE_SCENARIO, null, 2);
