pub mod compiler;
pub mod lua_ast;
pub mod objects;
pub mod types;

// Re-export key types for convenience
pub use compiler::{compile_joker, compile_joker_with_options, compile_node_snippet};
pub use compiler::{
    compile_consumable, compile_consumable_type, compile_enhancement, compile_seal,
    compile_edition, compile_voucher, compile_deck, compile_rarity, compile_booster,
};
pub use lua_ast::{format_lua_source, Chunk, Emitter, Expr, Stmt};
pub use objects::GameObject;
pub use types::{
    JokerDef, ConsumableDef, ConsumableTypeDef, EnhancementDef, SealDef, EditionDef,
    RarityDef, VoucherDef, DeckDef, BoosterDef, ModConfig, ObjectType,
};

#[cfg(test)]
mod integration_tests {
    use super::*;
    use std::collections::HashMap;
    use types::*;

    #[test]
    fn test_joker_with_add_chips() {
        let joker = JokerDef {
            key: "newjoker3".to_string(),
            name: "New Joker".to_string(),
            description: vec!["A {C:blue}custom{} joker with {C:red}unique{} effects.".to_string()],
            cost: 4,
            rarity: "common".to_string(),
            blueprint_compat: true,
            eternal_compat: true,
            perishable_compat: true,
            unlocked: true,
            discovered: true,
            atlas: "Joker".to_string(),
            pos: AtlasPos { x: 0, y: 0 },
            soul_pos: None,
            display_size: None,
            rules: vec![RuleDef {
                id: "rule1".to_string(),
                trigger: "hand_played".to_string(),
                retrigger: false,
                destroy: false,
                condition_groups: vec![],
                effects: vec![EffectDef {
                    effect_type: "add_chips".to_string(),
                    params: {
                        let mut p = HashMap::new();
                        p.insert("value".to_string(), ParamValue::Int(10));
                        p
                    },
                }],
                random_groups: vec![],
                loop_groups: vec![],
            }],
            appearance: None,
            unlock: None,
            user_variables: vec![],
            force_eternal: false,
            force_perishable: false,
            force_rental: false,
            force_foil: false,
            force_holographic: false,
            force_polychrome: false,
            force_negative: false,
            ignore_slot_limit: false,
            info_queues: vec![],
        };

        let chunk = compile_joker(&joker, "modprefix");
        let output = Emitter::new().emit_chunk(&chunk);
        println!("=== COMPILED JOKER OUTPUT ===\n{}", output);

        // Verify key structural elements
        assert!(
            output.contains("SMODS.Joker {"),
            "Should use table-call syntax (no parens)"
        );
        assert!(
            !output.contains("SMODS.Joker("),
            "Should NOT use function-call syntax"
        );
        assert!(
            output.contains("['name'] = 'New Joker'"),
            "loc_txt should use bracket keys"
        );
        assert!(
            output.contains("[1] = 'A {C:blue}custom{} joker"),
            "text should use numbered indices"
        );
        assert!(output.contains("['unlock']"), "Should have unlock section");
        assert!(
            output.contains("rarity = 1"),
            "Common rarity should be numeric 1"
        );
        assert!(output.contains("config ="), "Should have config section");
        assert!(
            output.contains("chips0 = 10"),
            "Config extra should have chips0"
        );
        assert!(
            output.contains("display_size ="),
            "Should have display_size"
        );
        assert!(
            output.contains("71 * 1"),
            "display_size should use 71 * scale"
        );
        assert!(
            !output.contains("SMODS.calculate_effect"),
            "Should NOT wrap in SMODS.calculate_effect"
        );
        assert!(output.contains("return {"), "Should have plain return");
    }

    #[test]
    fn test_joker_with_add_chips_string_literal_uses_config_extra() {
        let joker = JokerDef {
            key: "newjoker_string_value".to_string(),
            name: "New Joker".to_string(),
            description: vec!["String literal value test".to_string()],
            cost: 4,
            rarity: "common".to_string(),
            blueprint_compat: true,
            eternal_compat: true,
            perishable_compat: true,
            unlocked: true,
            discovered: true,
            atlas: "Joker".to_string(),
            pos: AtlasPos { x: 0, y: 0 },
            soul_pos: None,
            display_size: None,
            rules: vec![RuleDef {
                id: "rule1".to_string(),
                trigger: "hand_played".to_string(),
                retrigger: false,
                destroy: false,
                condition_groups: vec![],
                effects: vec![EffectDef {
                    effect_type: "add_chips".to_string(),
                    params: {
                        let mut p = HashMap::new();
                        p.insert("value".to_string(), ParamValue::Str("10".to_string()));
                        p
                    },
                }],
                random_groups: vec![],
                loop_groups: vec![],
            }],
            appearance: None,
            unlock: None,
            user_variables: vec![],
            force_eternal: false,
            force_perishable: false,
            force_rental: false,
            force_foil: false,
            force_holographic: false,
            force_polychrome: false,
            force_negative: false,
            ignore_slot_limit: false,
            info_queues: vec![],
        };

        let chunk = compile_joker(&joker, "modprefix");
        let output = Emitter::new().emit_chunk(&chunk);

        assert!(
            output.contains("chips0 = 10"),
            "Config extra should include chips0"
        );
        assert!(
            output.contains("chips = card.ability.extra.chips0"),
            "Return field should reference ability.extra var"
        );
        assert!(
            !output.contains("return { chips = 10"),
            "Should not inline numeric literal chips value in return"
        );
    }

    #[test]
    fn test_multiple_effects_use_nested_extra_chain() {
        let joker = JokerDef {
            key: "newjoker_multi_effect".to_string(),
            name: "Multi Effect Joker".to_string(),
            description: vec!["Multi effect chain test".to_string()],
            cost: 4,
            rarity: "common".to_string(),
            blueprint_compat: true,
            eternal_compat: true,
            perishable_compat: true,
            unlocked: true,
            discovered: true,
            atlas: "Joker".to_string(),
            pos: AtlasPos { x: 0, y: 0 },
            soul_pos: None,
            display_size: None,
            rules: vec![RuleDef {
                id: "rule1".to_string(),
                trigger: "hand_played".to_string(),
                retrigger: false,
                destroy: false,
                condition_groups: vec![],
                effects: vec![
                    EffectDef {
                        effect_type: "add_chips".to_string(),
                        params: {
                            let mut p = HashMap::new();
                            p.insert("value".to_string(), ParamValue::Int(10));
                            p
                        },
                    },
                    EffectDef {
                        effect_type: "add_mult".to_string(),
                        params: {
                            let mut p = HashMap::new();
                            p.insert("value".to_string(), ParamValue::Int(3));
                            p
                        },
                    },
                ],
                random_groups: vec![],
                loop_groups: vec![],
            }],
            appearance: None,
            unlock: None,
            user_variables: vec![],
            force_eternal: false,
            force_perishable: false,
            force_rental: false,
            force_foil: false,
            force_holographic: false,
            force_polychrome: false,
            force_negative: false,
            ignore_slot_limit: false,
            info_queues: vec![],
        };

        let chunk = compile_joker(&joker, "modprefix");
        let output = Emitter::new().emit_chunk(&chunk);

        assert!(
            output.contains("chips = card.ability.extra.chips0"),
            "First effect should remain at root return level"
        );
        assert!(
            output.contains("extra = {") && output.contains("mult = card.ability.extra.mult0"),
            "Second effect should be nested in return.extra"
        );
    }
}
