mod common;

use balatro_codegen::types::ParamValue;
use balatro_codegen::{compile_voucher, Emitter};

use common::{and_group, base_voucher, condition, effect, rule_with_conditions, rule_with_effects};

#[test]
fn voucher_generates_redeem_hook_for_card_used_rules() {
    let mut voucher = base_voucher();
    voucher.rules = vec![rule_with_effects(
        "redeem_rule",
        "card_used",
        vec![effect("add_chips", &[("value", ParamValue::Int(5))])],
    )];

    let chunk = compile_voucher(&voucher, "modprefix");
    let output = Emitter::new().emit_chunk(&chunk);

    assert!(output.contains("SMODS.Voucher {"));
    assert!(output.contains("redeem = function"));
    assert!(!output.contains("calculate = function"));
}

#[test]
fn voucher_card_used_conditional_precedes_unconditional_fallback() {
    let mut voucher = base_voucher();
    voucher.rules = vec![
        rule_with_effects(
            "fallback",
            "card_used",
            vec![effect("add_chips", &[("value", ParamValue::Int(2))])],
        ),
        rule_with_conditions(
            "conditional",
            "card_used",
            vec![and_group(vec![condition("first_played_hand")])],
            vec![effect("add_mult", &[("value", ParamValue::Int(7))])],
        ),
    ];

    let chunk = compile_voucher(&voucher, "modprefix");
    let output = Emitter::new().emit_chunk(&chunk);

    let cond_idx = output
        .find("mult = card.ability.extra.mult0")
        .expect("expected conditional payload in redeem function");
    let fallback_idx = output
        .find("chips = card.ability.extra.chips0")
        .expect("expected fallback payload in redeem function");

    assert!(cond_idx < fallback_idx);
}
