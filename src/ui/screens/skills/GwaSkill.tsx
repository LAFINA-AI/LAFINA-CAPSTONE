import React, {useState} from 'react';
import {Alert, Modal, Text, TouchableOpacity, View} from 'react-native';
import {Minus, Plus} from 'lucide-react-native';
import {academicProfileStore} from '../../../storage/academicProfileStore';
import {readSkillState, writeSkillState} from '../../../skills/skillsState';
import {stepGrade, weightedGwa} from '../../../skills/studyLogic';
import type {GradeSubject} from '../../../skills/studyLogic';
import {db} from '../../../storage/database';
import {generateId} from '../../../utils';
import {SkillFonts, useSkillsPalette} from '../../theme/skills';
import {SkillButton, SkillCard, SkillInput, SkillText, ui} from './SkillUI';

export function GwaSkill({userId}: {userId: string}) {
  const p = useSkillsPalette();
  const profile = academicProfileStore.get(userId);
  const currentTerm = profile?.academicYearTerm || profile?.academicTerm || '';
  const [term, setTerm] = useState(() =>
    readSkillState(userId, 'gwa.lastSemester', currentTerm),
  );
  const [termDraft, setTermDraft] = useState(term);
  const [termEditor, setTermEditor] = useState(false);
  const fromCor = (): GradeSubject[] =>
    profile?.courses
      .filter(c => c.creditUnits > 0)
      .map(c => ({
        id: generateId('subject'),
        name: c.code || c.subjectTitle,
        units: c.creditUnits,
        grade: null,
      })) ?? [];
  const [subjects, setSubjects] = useState<GradeSubject[]>(() =>
    readSkillState(
      userId,
      `gwa.${encodeURIComponent(term)}`,
      term && term === currentTerm ? fromCor() : [],
    ),
  );
  const [editor, setEditor] = useState<{
    id: string | null;
    name: string;
    units: string;
  } | null>(null);
  const [status, setStatus] = useState('');
  const persist = (next: GradeSubject[], semester = term) => {
    try {
      if (!semester.trim()) throw new Error('Choose a semester first.');
      db.transactionSync(() => {
        writeSkillState(userId, `gwa.${encodeURIComponent(semester)}`, next);
        writeSkillState(userId, 'gwa.lastSemester', semester);
      });
      setSubjects(next);
      setStatus('Saved on this phone.');
      return true;
    } catch (e) {
      setStatus((e as Error).message);
      return false;
    }
  };
  const result = weightedGwa(subjects);
  const change = (id: string, delta: number) =>
    persist(
      subjects.map(s =>
        s.id === id ? {...s, grade: stepGrade(s.grade, delta)} : s,
      ),
    );
  const saveSubject = () => {
    if (!editor) return;
    const units = Number(editor.units);
    if (
      !editor.name.trim() ||
      !Number.isFinite(units) ||
      units <= 0 ||
      units > 30
    ) {
      setStatus(
        'Enter a subject name and credit units greater than 0 and at most 30.',
      );
      return;
    }
    const next = editor.id
      ? subjects.map(s =>
          s.id === editor.id ? {...s, name: editor.name.trim(), units} : s,
        )
      : [
          ...subjects,
          {
            id: generateId('subject'),
            name: editor.name.trim(),
            units,
            grade: null,
          },
        ];
    if (persist(next)) setEditor(null);
  };
  return (
    <>
      <SkillCard
        style={{backgroundColor: p.darkInkBtn, borderRadius: 24, padding: 20}}
      >
        <Text
          style={{
            fontFamily: SkillFonts.semibold,
            fontSize: 12,
            letterSpacing: 1.2,
            color: '#FFFFFF',
          }}
        >
          YOUR GWA
        </Text>
        <View style={ui.between}>
          <Text
            accessibilityLiveRegion="polite"
            style={{
              fontFamily: SkillFonts.semibold,
              fontSize: 46,
              color: '#FFFFFF',
            }}
          >
            {result?.toFixed(2) ?? '—'}
          </Text>
          <View style={{width: 92, gap: 8}}>
            <View
              style={{height: 8, borderRadius: 4, backgroundColor: '#FFFFFF33'}}
            >
              {result !== null && (
                <View
                  style={{
                    position: 'absolute',
                    left: `${((result - 1) / 4) * 96}%`,
                    width: 4,
                    height: 18,
                    top: -5,
                    borderRadius: 2,
                    backgroundColor: '#FFFFFF',
                  }}
                />
              )}
            </View>
            <Text
              style={{
                color: '#FFFFFF',
                fontFamily: SkillFonts.body,
                fontSize: 11,
              }}
            >
              1.00 3.00 5.00
            </Text>
          </View>
        </View>
        <Text
          style={{fontFamily: SkillFonts.body, fontSize: 13, color: '#FFFFFF'}}
        >
          {subjects.filter(s => s.grade !== null).length} graded subjects ·{' '}
          {subjects
            .filter(s => s.grade !== null)
            .reduce((n, s) => n + s.units, 0)}{' '}
          units
        </Text>
      </SkillCard>
      <SkillText muted size={12}>
        1.00 is the highest grade; 3.00 is the lowest passing grade. Adjust by
        0.25. Ungraded subjects are excluded. This is an estimate.
      </SkillText>
      <View style={[ui.between, ui.section]}>
        <View style={ui.fill}>
          <SkillText strong size={17}>
            {term || 'Choose a semester'}
          </SkillText>
        </View>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Change semester"
          onPress={() => setTermEditor(true)}
          style={ui.icon}
        >
          <SkillText muted size={12}>
            Change
          </SkillText>
        </TouchableOpacity>
      </View>
      {!subjects.length && (
        <SkillText muted>
          No subjects yet. Add one below or import your COR subjects.
        </SkillText>
      )}
      {subjects.length > 0 && (
        <SkillCard style={{paddingVertical: 0, paddingHorizontal: 12}}>
          {subjects.map(s => (
            <View
              key={s.id}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                minHeight: 68,
                borderBottomWidth: 1,
                borderColor: p.border,
                gap: 2,
              }}
            >
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={`Edit ${s.name}, ${s.units} units`}
                onPress={() =>
                  setEditor({id: s.id, name: s.name, units: String(s.units)})
                }
                style={[ui.fill, {minHeight: 44, justifyContent: 'center'}]}
              >
                <SkillText strong size={15}>
                  {s.name}
                </SkillText>
                <SkillText muted size={12}>
                  {s.units} units
                </SkillText>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={`Better grade for ${s.name}`}
                style={ui.icon}
                onPress={() => change(s.id, -0.25)}
              >
                <Minus size={16} color={p.text} />
              </TouchableOpacity>
              <View
                style={{
                  minWidth: 58,
                  borderRadius: 10,
                  paddingVertical: 8,
                  backgroundColor: p.surface,
                }}
              >
                <SkillText strong size={15} center>
                  {s.grade?.toFixed(2) ?? '—'}
                </SkillText>
              </View>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={`Lower grade for ${s.name}`}
                style={ui.icon}
                onPress={() => change(s.id, 0.25)}
              >
                <Plus size={16} color={p.text} />
              </TouchableOpacity>
            </View>
          ))}
        </SkillCard>
      )}
      <SkillButton
        secondary
        label="+ Add subject"
        onPress={() => {
          if (!term) {
            setTermEditor(true);
            return;
          }
          setEditor({id: null, name: '', units: ''});
        }}
      />
      {!!profile?.courses.length && (
        <SkillButton
          secondary
          label="Import subjects from COR"
          onPress={() => {
            const existing = new Set(subjects.map(s => s.name));
            persist([
              ...subjects,
              ...fromCor().filter(s => !existing.has(s.name)),
            ]);
          }}
        />
      )}
      {!!status && <SkillText muted>{status}</SkillText>}
      <Modal
        visible={termEditor || editor !== null}
        transparent
        animationType="none"
        onRequestClose={() => {
          setEditor(null);
          setTermEditor(false);
        }}
      >
        <View
          style={{
            flex: 1,
            justifyContent: 'center',
            padding: 20,
            backgroundColor: '#00000088',
          }}
        >
          <SkillCard>
            {termEditor ? (
              <>
                <SkillInput
                  label="Semester"
                  value={termDraft}
                  onChangeText={setTermDraft}
                  placeholder="Academic year and semester"
                />
                <SkillButton
                  label="Open semester"
                  onPress={() => {
                    const next = termDraft.trim();
                    if (!next) return;
                    const rows = readSkillState<GradeSubject[]>(
                      userId,
                      `gwa.${encodeURIComponent(next)}`,
                      next === currentTerm ? fromCor() : [],
                    );
                    if (persist(rows, next)) {
                      setTerm(next);
                      setTermEditor(false);
                    }
                  }}
                />
              </>
            ) : (
              editor && (
                <>
                  <SkillInput
                    label="Subject name"
                    value={editor.name}
                    onChangeText={name => setEditor({...editor, name})}
                  />
                  <SkillInput
                    label="Credit units"
                    keyboardType="decimal-pad"
                    value={editor.units}
                    onChangeText={units => setEditor({...editor, units})}
                  />
                  <SkillButton label="Save subject" onPress={saveSubject} />
                  {editor.id && (
                    <>
                      <SkillButton
                        secondary
                        label="Clear grade"
                        onPress={() => {
                          if (
                            persist(
                              subjects.map(s =>
                                s.id === editor.id ? {...s, grade: null} : s,
                              ),
                            )
                          )
                            setEditor(null);
                        }}
                      />
                      <SkillButton
                        secondary
                        label="Remove subject"
                        onPress={() =>
                          Alert.alert('Remove subject?', editor.name, [
                            {text: 'Cancel', style: 'cancel'},
                            {
                              text: 'Remove',
                              onPress: () => {
                                if (
                                  persist(
                                    subjects.filter(s => s.id !== editor.id),
                                  )
                                )
                                  setEditor(null);
                              },
                            },
                          ])
                        }
                      />
                    </>
                  )}
                </>
              )
            )}
            <SkillButton
              secondary
              label="Cancel"
              onPress={() => {
                setEditor(null);
                setTermEditor(false);
              }}
            />
            {!!status && <SkillText muted>{status}</SkillText>}
          </SkillCard>
        </View>
      </Modal>
    </>
  );
}
