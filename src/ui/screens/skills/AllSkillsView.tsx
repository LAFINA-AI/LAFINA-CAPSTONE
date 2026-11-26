import React from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {ArrowRight, ChevronRight, Sparkles} from 'lucide-react-native';
import {SkillFonts, useSkillsPalette} from '../../theme/skills';
import {SKILLS} from './SkillsHub';
import type {SkillRoute} from './SkillsHub';
import {Entry} from './SkillUI';

type SkillItem = (typeof SKILLS)[number];
type SkillId = SkillItem['id'];

const STUDY_IDS: readonly SkillId[] = [
  'materials',
  'flashcards',
  'quiz',
  'summarizer',
];
const TOOLS_IDS: readonly SkillId[] = ['pomodoro', 'gwa', 'meetings'];
const CREATE_FORMAT_TAGS = ['Slides', 'Doc', 'PDF', 'Sheet'] as const;

type Tone = {
  tileBg: string;
  iconColor: string;
};

function getSkillTone(
  id: SkillId,
  p: ReturnType<typeof useSkillsPalette>,
): Tone {
  const resolveBg = (candidate: string) =>
    candidate === p.card ? p.surface : candidate;
  switch (id) {
    case 'materials':
    case 'summarizer':
      return {tileBg: resolveBg(p.blueSoft), iconColor: p.goodInk};
    case 'flashcards':
    case 'pomodoro':
      return {tileBg: resolveBg(p.peach), iconColor: p.hardInk};
    case 'quiz':
    case 'gwa':
      return {tileBg: resolveBg(p.mint), iconColor: p.easyInk};
    case 'meetings':
      return {tileBg: resolveBg(p.dangerSoft), iconColor: p.againInk};
    default:
      return {tileBg: p.surface, iconColor: p.accent};
  }
}

export function AllSkillsView({
  onSelect,
}: {
  onSelect: (route: SkillRoute) => void;
}) {
  const p = useSkillsPalette();
  const byId = new Map<SkillId, SkillItem>(SKILLS.map(s => [s.id, s]));

  const studySkills = STUDY_IDS.map(id => byId.get(id)).filter(
    (s): s is SkillItem => Boolean(s),
  );
  const toolSkills = TOOLS_IDS.map(id => byId.get(id)).filter(
    (s): s is SkillItem => Boolean(s),
  );
  const createSkill = byId.get('docgen');
  const assigned = new Set<SkillId>([...STUDY_IDS, ...TOOLS_IDS, 'docgen']);
  const extraSkills = SKILLS.filter(s => !assigned.has(s.id));

  const sections: Array<{label: string; items: SkillItem[]}> = [
    {label: 'Study & review', items: studySkills},
    {label: 'Focus & tools', items: [...toolSkills, ...extraSkills]},
  ].filter(section => section.items.length > 0);

  let cardIndex = 0;

  return (
    <View testID="all-skills-view" style={styles.root}>
      <View style={styles.introRow}>
        <Text style={[styles.introText, {color: p.muted}]}>
          Pick a study or productivity tool to jump right in.
        </Text>
        <View
          style={[
            styles.countPill,
            {backgroundColor: p.surface, borderColor: p.border},
          ]}
        >
          <Text style={[styles.countText, {color: p.accent}]}>
            {SKILLS.length} tools
          </Text>
        </View>
      </View>

      {sections.map(section => (
        <View key={section.label} style={styles.section}>
          <Text style={[styles.sectionLabel, {color: p.muted}]}>
            {section.label.toUpperCase()}
          </Text>
          <View style={styles.cardList}>
            {section.items.map(skill => {
              const Icon = skill.icon;
              const tone = getSkillTone(skill.id, p);
              const delay = cardIndex * 30;
              cardIndex += 1;

              return (
                <Entry key={skill.id} delay={delay}>
                  <TouchableOpacity
                    testID={`all-skills-item-${skill.id}`}
                    accessibilityRole="button"
                    accessibilityLabel={skill.title}
                    accessibilityHint={skill.description}
                    activeOpacity={0.78}
                    onPress={() => onSelect(skill.id)}
                    style={[
                      styles.skillCard,
                      {
                        backgroundColor: p.card,
                        borderColor: p.border,
                      },
                      !p.isDarkMode && styles.cardShadow,
                    ]}
                  >
                    <View
                      style={[
                        styles.iconTile,
                        {
                          backgroundColor: tone.tileBg,
                          borderColor: p.border,
                        },
                      ]}
                    >
                      <Icon size={22} color={tone.iconColor} />
                    </View>
                    <View style={styles.cardBody}>
                      <Text
                        numberOfLines={1}
                        style={[styles.cardTitle, {color: p.text}]}
                      >
                        {skill.title}
                      </Text>
                      <Text
                        numberOfLines={1}
                        style={[styles.cardDesc, {color: p.muted}]}
                      >
                        {skill.description}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.chevronBadge,
                        {backgroundColor: p.surface},
                      ]}
                    >
                      <ChevronRight size={17} color={p.muted} />
                    </View>
                  </TouchableOpacity>
                </Entry>
              );
            })}
          </View>
        </View>
      ))}

      {createSkill && (
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, {color: p.muted}]}>
            AI CREATION
          </Text>
          <Entry delay={cardIndex * 30}>
            <TouchableOpacity
              testID={`all-skills-item-${createSkill.id}`}
              accessibilityRole="button"
              accessibilityLabel={createSkill.title}
              accessibilityHint={createSkill.description}
              activeOpacity={0.84}
              onPress={() => onSelect(createSkill.id)}
              style={[
                styles.featuredCard,
                {backgroundColor: p.darkInkBtn},
                !p.isDarkMode && styles.featuredShadow,
              ]}
            >
              <Sparkles
                size={96}
                color={p.accent}
                style={styles.featuredWatermark}
              />
              <View style={styles.featuredTop}>
                <View style={styles.featuredIconTile}>
                  <createSkill.icon size={22} color="#FFFFFF" />
                </View>
                <View style={styles.cardBody}>
                  <Text style={styles.featuredTitle}>{createSkill.title}</Text>
                  <Text style={styles.featuredDesc}>
                    {createSkill.description}
                  </Text>
                </View>
                <View
                  style={[
                    styles.featuredArrow,
                    {backgroundColor: p.accent},
                  ]}
                >
                  <ArrowRight size={18} color={p.onAccent} />
                </View>
              </View>
              <View style={styles.tagRow}>
                {CREATE_FORMAT_TAGS.map(tag => (
                  <View key={tag} style={styles.formatTag}>
                    <Text style={styles.formatTagText}>{tag}</Text>
                  </View>
                ))}
              </View>
            </TouchableOpacity>
          </Entry>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 20,
    paddingTop: 4,
  },
  introRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  introText: {
    flex: 1,
    fontFamily: SkillFonts.body,
    fontSize: 13.5,
    lineHeight: 19,
  },
  countPill: {
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  countText: {
    fontFamily: SkillFonts.semibold,
    fontSize: 12,
  },
  section: {
    gap: 10,
  },
  sectionLabel: {
    fontFamily: SkillFonts.semibold,
    fontSize: 11,
    letterSpacing: 0.9,
    paddingHorizontal: 4,
  },
  cardList: {
    gap: 10,
  },
  skillCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    minHeight: 74,
  },
  cardShadow: {
    shadowColor: '#1B1933',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  iconTile: {
    width: 48,
    height: 48,
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: {
    flex: 1,
    gap: 2,
  },
  cardTitle: {
    fontFamily: SkillFonts.semibold,
    fontSize: 15.5,
    letterSpacing: -0.2,
  },
  cardDesc: {
    fontFamily: SkillFonts.body,
    fontSize: 13,
    lineHeight: 18,
  },
  chevronBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featuredCard: {
    borderRadius: 24,
    padding: 16,
    gap: 14,
    overflow: 'hidden',
  },
  featuredShadow: {
    shadowColor: '#121022',
    shadowOffset: {width: 0, height: 8},
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 4,
  },
  featuredWatermark: {
    position: 'absolute',
    right: -14,
    top: -12,
    opacity: 0.25,
  },
  featuredTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  featuredIconTile: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: '#FFFFFF1F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  featuredTitle: {
    fontFamily: SkillFonts.semibold,
    fontSize: 16,
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  featuredDesc: {
    fontFamily: SkillFonts.body,
    fontSize: 13,
    color: '#FFFFFFCC',
    lineHeight: 18,
  },
  featuredArrow: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  formatTag: {
    backgroundColor: '#FFFFFF1E',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  formatTagText: {
    fontFamily: SkillFonts.medium,
    fontSize: 12,
    color: '#FFFFFF',
  },
});
