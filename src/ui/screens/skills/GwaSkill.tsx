import React, {useState} from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {Minus, Plus} from 'lucide-react-native';
import {academicProfileStore} from '../../../storage/academicProfileStore';
import {readSkillState, writeSkillState} from '../../../skills/skillsState';
import {stepGrade, weightedGwa} from '../../../skills/studyLogic';
import type {GradeSubject} from '../../../skills/studyLogic';
import {db} from '../../../storage/database';
import {generateId} from '../../../utils';
import {SkillFonts, useSkillsPalette} from '../../theme/skills';
import {SkillButton, SkillCard, SkillInput, SkillText, ui} from './SkillUI';

const USTP_GRADES = [
  1.0, 1.25, 1.5, 1.75, 2.0, 2.25, 2.5, 2.75, 3.0, 4.0, 5.0,
] as const;

const normalizeSubjectKey = (name: string) => name.trim().toLowerCase();

export function GwaSkill({userId}: {userId: string}) {
  const p = useSkillsPalette();
  const profile = academicProfileStore.get(userId);
  const currentTerm = profile?.academicYearTerm || profile?.academicTerm || '';
  const [term, setTerm] = useState(() =>
    readSkillState(userId, 'gwa.lastSemester', currentTerm),
  );
  const [semesters, setSemesters] = useState<string[]>(() => {
    const saved = readSkillState<string[]>(userId, 'gwa.semesters', []);
    return Array.from(
      new Set([term, ...saved].map(s => s.trim()).filter(Boolean)),
    );
  });
  const [termDraft, setTermDraft] = useState(term);
  const [termEditor, setTermEditor] = useState(false);
  const fromCor = (): GradeSubject[] =>
    profile?.courses
      .filter(c => c.creditUnits > 0)
      .map(c => ({
        id: generateId('subject'),
        name: (c.code || c.subjectTitle).trim(),
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
    grade: number | null;
  } | null>(null);
  const [status, setStatus] = useState<{text: string; danger?: boolean} | null>(
    null,
  );
  const [modalError, setModalError] = useState('');
  const persist = (next: GradeSubject[], semester = term) => {
    const cleanSemester = semester.trim();
    try {
      if (!cleanSemester) throw new Error('Choose a semester first.');
      const nextSemesters = Array.from(
        new Set(
          [cleanSemester, ...semesters].map(s => s.trim()).filter(Boolean),
        ),
      );
      db.transactionSync(() => {
        writeSkillState(
          userId,
          `gwa.${encodeURIComponent(cleanSemester)}`,
          next,
        );
        writeSkillState(userId, 'gwa.lastSemester', cleanSemester);
        writeSkillState(userId, 'gwa.semesters', nextSemesters);
      });
      setSubjects(next);
      setSemesters(nextSemesters);
      setStatus({text: 'Saved on this phone.'});
      setModalError('');
      return true;
    } catch (e) {
      const msg = (e as Error).message || 'Could not save grades.';
      if (termEditor || editor !== null) setModalError(msg);
      else setStatus({text: msg, danger: true});
      return false;
    }
  };
  let result: number | null = null;
  let gwaError = '';
  try {
    result = weightedGwa(subjects);
  } catch (e) {
    gwaError = (e as Error).message || 'Invalid subject units or grade values.';
  }
  const openTermModal = () => {
    setTermDraft(term);
    setModalError('');
    setEditor(null);
    setTermEditor(true);
  };
  const closeModals = () => {
    setEditor(null);
    setTermEditor(false);
    setModalError('');
  };
  const openSemester = (rawSemester: string) => {
    const next = rawSemester.trim();
    if (!next) {
      setModalError('Enter a semester name first.');
      return;
    }
    const rows = readSkillState<GradeSubject[]>(
      userId,
      `gwa.${encodeURIComponent(next)}`,
      next === currentTerm ? fromCor() : [],
    );
    if (persist(rows, next)) {
      setTerm(next);
      setTermEditor(false);
      setModalError('');
    }
  };
  const deleteSemester = (target: string) => {
    Alert.alert('Remove semester?', target, [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Remove',
        onPress: () => {
          try {
            const nextSemesters = semesters.filter(s => s !== target);
            const fallbackTerm =
              target === term ? nextSemesters[0] ?? '' : term;
            db.transactionSync(() => {
              db.executeSync(
                'DELETE FROM local_settings WHERE user_id = ? AND key = ?',
                [userId, `skills.gwa.${encodeURIComponent(target)}`],
              );
              writeSkillState(userId, 'gwa.semesters', nextSemesters);
              writeSkillState(userId, 'gwa.lastSemester', fallbackTerm);
            });
            setSemesters(nextSemesters);
            if (target === term) {
              setTerm(fallbackTerm);
              setTermDraft(fallbackTerm);
              setSubjects(
                fallbackTerm
                  ? readSkillState<GradeSubject[]>(
                      userId,
                      `gwa.${encodeURIComponent(fallbackTerm)}`,
                      [],
                    )
                  : [],
              );
            }
            setStatus({text: `Removed ${target}.`});
          } catch (e) {
            setModalError((e as Error).message || 'Could not remove semester.');
          }
        },
      },
    ]);
  };
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
      setModalError(
        'Enter a subject name and credit units greater than 0 and at most 30.',
      );
      return;
    }
    const next = editor.id
      ? subjects.map(s =>
          s.id === editor.id
            ? {...s, name: editor.name.trim(), units, grade: editor.grade}
            : s,
        )
      : [
          ...subjects,
          {
            id: generateId('subject'),
            name: editor.name.trim(),
            units,
            grade: editor.grade,
          },
        ];
    if (persist(next)) closeModals();
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
      {!!gwaError && <SkillText danger>{gwaError}</SkillText>}
      <SkillText muted size={12}>
        1.00 is the highest grade; 3.00 is the lowest passing grade. Adjust by
        0.25 or tap a grade to pick directly. Ungraded subjects are excluded.
        This is an estimate.
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
          onPress={openTermModal}
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
                onPress={() => {
                  setModalError('');
                  setEditor({
                    id: s.id,
                    name: s.name,
                    units: String(s.units),
                    grade: s.grade,
                  });
                }}
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
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={`Pick grade for ${s.name}`}
                onPress={() => {
                  setModalError('');
                  setEditor({
                    id: s.id,
                    name: s.name,
                    units: String(s.units),
                    grade: s.grade,
                  });
                }}
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
              </TouchableOpacity>
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
            openTermModal();
            return;
          }
          setModalError('');
          setEditor({id: null, name: '', units: '', grade: null});
        }}
      />
      {!!profile?.courses.length && (
        <SkillButton
          secondary
          label="Import subjects from COR"
          onPress={() => {
            if (!term) {
              setStatus({text: 'Choose a semester first.', danger: true});
              openTermModal();
              return;
            }
            const existing = new Set(
              subjects.map(s => normalizeSubjectKey(s.name)),
            );
            const incoming = fromCor().filter(s => {
              const key = normalizeSubjectKey(s.name);
              if (!key || existing.has(key)) return false;
              existing.add(key);
              return true;
            });
            if (!incoming.length) {
              setStatus({
                text: 'All COR subjects are already in this semester.',
              });
              return;
            }
            persist([...subjects, ...incoming]);
          }}
        />
      )}
      {!!status && (
        <SkillText danger={status.danger} muted={!status.danger}>
          {status.text}
        </SkillText>
      )}
      <Modal
        visible={termEditor || editor !== null}
        transparent
        animationType="none"
        onRequestClose={closeModals}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{
            flex: 1,
            justifyContent: 'center',
            padding: 20,
            backgroundColor: '#00000088',
          }}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            style={{maxHeight: '90%'}}
            contentContainerStyle={{flexGrow: 1, justifyContent: 'center'}}
          >
            <SkillCard>
              {termEditor ? (
                <>
                  <SkillInput
                    label="Semester"
                    value={termDraft}
                    onChangeText={setTermDraft}
                    placeholder="Academic year and semester"
                    maxLength={80}
                  />
                  <SkillButton
                    label="Open semester"
                    onPress={() => openSemester(termDraft)}
                  />
                  {semesters.length > 0 && (
                    <View style={{gap: 8, marginTop: 4}}>
                      <SkillText muted size={12}>
                        Saved semesters
                      </SkillText>
                      {semesters.map(s => (
                        <View key={s} style={ui.row}>
                          <View style={ui.fill}>
                            <SkillButton
                              secondary={s !== term}
                              label={s}
                              onPress={() => openSemester(s)}
                            />
                          </View>
                          <TouchableOpacity
                            accessibilityRole="button"
                            accessibilityLabel={`Delete semester ${s}`}
                            onPress={() => deleteSemester(s)}
                            style={ui.icon}
                          >
                            <SkillText danger size={12}>
                              Delete
                            </SkillText>
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  )}
                </>
              ) : (
                editor && (
                  <>
                    <SkillInput
                      label="Subject name"
                      value={editor.name}
                      onChangeText={name => setEditor({...editor, name})}
                      maxLength={80}
                    />
                    <SkillInput
                      label="Credit units"
                      keyboardType="decimal-pad"
                      value={editor.units}
                      onChangeText={units => setEditor({...editor, units})}
                      maxLength={5}
                    />
                    <View style={{gap: 6}}>
                      <SkillText muted size={12}>
                        Quick grade
                      </SkillText>
                      <View
                        style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6}}
                      >
                        {USTP_GRADES.map(g => {
                          const active = editor.grade === g;
                          return (
                            <TouchableOpacity
                              key={g}
                              accessibilityRole="button"
                              accessibilityLabel={`Set grade ${g.toFixed(2)}`}
                              onPress={() => setEditor({...editor, grade: g})}
                              style={{
                                minHeight: 36,
                                minWidth: 54,
                                paddingHorizontal: 10,
                                borderRadius: 999,
                                alignItems: 'center',
                                justifyContent: 'center',
                                backgroundColor: active ? p.accent : p.surface,
                                borderWidth: 1,
                                borderColor: active ? p.accent : p.border,
                              }}
                            >
                              <Text
                                style={{
                                  fontFamily: SkillFonts.semibold,
                                  fontSize: 13,
                                  color: active ? '#FFFFFF' : p.text,
                                }}
                              >
                                {g.toFixed(2)}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                        <TouchableOpacity
                          accessibilityRole="button"
                          accessibilityLabel="Clear quick grade"
                          onPress={() => setEditor({...editor, grade: null})}
                          style={{
                            minHeight: 36,
                            paddingHorizontal: 12,
                            borderRadius: 999,
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor:
                              editor.grade === null ? p.darkInkBtn : p.surface,
                            borderWidth: 1,
                            borderColor: p.border,
                          }}
                        >
                          <Text
                            style={{
                              fontFamily: SkillFonts.semibold,
                              fontSize: 13,
                              color: editor.grade === null ? '#FFFFFF' : p.text,
                            }}
                          >
                            Clear
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
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
                              closeModals();
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
                                    closeModals();
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
              <SkillButton secondary label="Cancel" onPress={closeModals} />
              {!!modalError && <SkillText danger>{modalError}</SkillText>}
            </SkillCard>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}
