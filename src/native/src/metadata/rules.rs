use std::collections::BTreeMap;

use super::{ArgumentEntry, Platform, Rule, RuleAction, VersionMetadata};

pub fn evaluate_rules(
    rules: Option<&[Rule]>,
    platform: &Platform,
    features: &BTreeMap<String, bool>,
) -> bool {
    let Some(rules) = rules else { return true };
    let mut allowed = false;
    for rule in rules {
        if rule_matches(rule, platform, features) {
            allowed = rule.action == RuleAction::Allow;
        }
    }
    allowed
}

pub fn substitute_placeholders(input: &str, values: &BTreeMap<String, String>) -> String {
    let mut output = String::with_capacity(input.len());
    let mut rest = input;
    while let Some(start) = rest.find("${") {
        output.push_str(&rest[..start]);
        let after = &rest[start + 2..];
        let Some(end) = after.find('}') else {
            output.push_str(&rest[start..]);
            return output;
        };
        let key = &after[..end];
        if !key.is_empty()
            && key
                .chars()
                .all(|ch| ch.is_ascii_alphanumeric() || ch == '_')
        {
            if let Some(value) = values.get(key) {
                output.push_str(value);
            }
        } else {
            output.push_str("${");
            output.push_str(key);
            output.push('}');
        }
        rest = &after[end + 1..];
    }
    output.push_str(rest);
    output
}

pub fn resolve_game_arguments(
    version: &VersionMetadata,
    values: &BTreeMap<String, String>,
    platform: &Platform,
    features: &BTreeMap<String, bool>,
) -> Vec<String> {
    if let Some(arguments) = &version.arguments {
        return resolve_argument_entries(&arguments.game, values, platform, features);
    }
    version
        .minecraft_arguments
        .as_deref()
        .unwrap_or_default()
        .split_whitespace()
        .map(|argument| substitute_placeholders(argument, values))
        .collect()
}

pub fn resolve_jvm_arguments(
    version: &VersionMetadata,
    values: &BTreeMap<String, String>,
    platform: &Platform,
    features: &BTreeMap<String, bool>,
) -> Vec<String> {
    version
        .arguments
        .as_ref()
        .map(|arguments| resolve_argument_entries(&arguments.jvm, values, platform, features))
        .unwrap_or_default()
}

fn resolve_argument_entries(
    entries: &[ArgumentEntry],
    values: &BTreeMap<String, String>,
    platform: &Platform,
    features: &BTreeMap<String, bool>,
) -> Vec<String> {
    let mut output = Vec::new();
    for entry in entries {
        match entry {
            ArgumentEntry::Literal(value) => {
                output.push(substitute_placeholders(value, values));
            }
            ArgumentEntry::Conditional(argument) => {
                if !argument.rules.is_empty()
                    && !evaluate_rules(Some(&argument.rules), platform, features)
                {
                    continue;
                }
                output.extend(
                    argument
                        .value
                        .as_slice()
                        .iter()
                        .map(|value| substitute_placeholders(value, values)),
                );
            }
        }
    }
    output
}

fn rule_matches(rule: &Rule, platform: &Platform, features: &BTreeMap<String, bool>) -> bool {
    if let Some(os) = &rule.os {
        if os
            .name
            .as_deref()
            .is_some_and(|name| !name.eq_ignore_ascii_case(platform.os.as_str()))
        {
            return false;
        }
        if os
            .arch
            .as_deref()
            .is_some_and(|arch| !architecture_pattern_matches(arch, &platform.arch))
        {
            return false;
        }
    }
    rule.features
        .iter()
        .all(|(name, expected)| features.get(name).copied().unwrap_or(false) == *expected)
}

fn architecture_pattern_matches(pattern: &str, target: &str) -> bool {
    pattern.split('|').any(|alternative| {
        let alternative = alternative.trim_start_matches('^').trim_end_matches('$');
        if alternative.is_empty()
            || alternative
                .chars()
                .any(|ch| matches!(ch, '[' | ']' | '(' | ')' | '*' | '+' | '?' | '.' | '\\'))
        {
            return false;
        }
        canonical_arch(alternative) == canonical_arch(target)
    })
}

fn canonical_arch(arch: &str) -> String {
    match arch.to_ascii_lowercase().as_str() {
        "x64" | "amd64" | "x86_64" => "x86_64".to_owned(),
        "x86" | "i386" | "i486" | "i586" | "i686" => "x86".to_owned(),
        "arm64" | "aarch64" | "aarch_64" => "arm64".to_owned(),
        other => other.to_owned(),
    }
}
