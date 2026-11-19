import {buildSkillDocumentPrompt} from '../../../skills/documentPrompt';
import {SKILLS_CAPABILITIES} from '../../../skills/skillsCapabilities';
import {SkillCheck, SkillHalo} from './SkillMotion';
import React, {useEffect, useRef, useState} from 'react';
import {NativeModules, Text, View} from 'react-native';
import RNFS from 'react-native-fs';
import {documentSkill} from '../../../skills/documentSkill';
import type {DocumentFormat} from '../../../skills/documentSkill';
import {onlineChatSkill} from '../../../skills/onlineChatSkill';
import {requireStudyOnline} from '../../../skills/studyAi';
import {readSkillState, writeSkillState} from '../../../skills/skillsState';
import {useStudyJob} from '../../../skills/studyJobs';
import {isUstpSchoolEnabled} from '../../../storage/ustpEligibility';
import {userStore} from '../../../storage/userStore';
import type {ChatAttachment} from '../../../storage/chatStore';
import {shareAttachment} from '../../components/chat/chatFiles';
import {
  ensureMicrophonePermission,
  startListening,
  stopListening,
  cancelListening,
} from '../../../ai/stt/sttService';
import {SkillFonts, useSkillsPalette} from '../../theme/skills';
import {
  Choices,
  SkillButton,
  SkillCard,
  SkillInput,
  SkillText,
  ui,
} from './SkillUI';
import {SourcePicker} from './SourcePicker';
import type {SkillSource} from './SourcePicker';

interface SkillFile {
  id: string;
  attachment: ChatAttachment;
  title: string;
  summary: string;
  createdAt: string;
  prompt: string;
  originalPrompt?: string;
  context?: string;
  citations?: string;
}
const FORMAT_MAP = {
  'Slides (.pptx)': 'pptx',
  'Document (.docx)': 'docx',
  PDF: 'pdf',
} as const;
export function DocGenSkill({userId}: {userId: string}) {
  const p = useSkillsPalette();
  const [format, setFormat] =
    useState<keyof typeof FORMAT_MAP>('Slides (.pptx)');
  const [prompt, setPrompt] = useState('');
  const [source, setSource] = useState<SkillSource>({text: '', label: ''});
  const [handbook, setHandbook] = useState<'Off' | 'USTP Handbook'>('Off');
  const [length, setLength] = useState<'Short' | 'Standard' | 'Detailed'>(
    'Standard',
  );
  const [files, setFiles] = useState<SkillFile[]>(() =>
    readSkillState(userId, 'files', []),
  );
  const [selected, setSelected] = useState<SkillFile | null>(null);

  const [notice, setNotice] = useState('');
  const capture = useRef<string | null>(null);
  const [dictating, setDictating] = useState(false);
  const job = useStudyJob<SkillFile>(userId, 'document');
  const stage = job.progress;
  const {result: completed, consume} = job;
  useEffect(() => {
    if (completed) {
      setSelected(completed);
      setFiles(readSkillState(userId, 'files', []));
      consume();
    }
  }, [completed, consume, userId]);
  useEffect(
    () => () => {
      if (capture.current) {
        void cancelListening(capture.current);
        capture.current = null;
      }
    },
    [],
  );
  const dictate = async () => {
    setNotice('');
    if (capture.current) {
      await stopListening(capture.current);
      return;
    }
    if (!(await ensureMicrophonePermission())) {
      setNotice(
        'Microphone permission was not granted. Type your prompt instead.',
      );
      return;
    }
    try {
      const handle = startListening();
      capture.current = handle.captureId;
      setDictating(true);
      const result = await handle.result;
      if (capture.current !== handle.captureId) return;
      if (!result.cancelled && result.transcript.trim())
        setPrompt(old => `${old} ${result.transcript}`.trim().slice(0, 500));
      else setNotice('No speech was recognized. You can type your prompt.');
    } catch (e) {
      setNotice(
        (e as Error).message || 'Dictation failed. Type your prompt instead.',
      );
    } finally {
      capture.current = null;
      setDictating(false);
    }
  };
  const generate = () => {
    setNotice('');

    void job.run(async () => {
      if (!prompt.trim() && !source.text.trim())
        throw new Error('Describe the file you need or choose a source.');
      await requireStudyOnline(userId);
      let context = source.text || selected?.context || '';
      let citations = selected?.citations || '';
      if (handbook === 'USTP Handbook') {
        if (!isUstpSchoolEnabled(userId))
          throw new Error(
            'Review your USTP COR in your profile before using the Handbook source.',
          );
        const handbookReply = await onlineChatSkill.sendChatMessage(
          [
            {
              role: 'user',
              content: `Find handbook passages relevant to this document request: ${prompt}. Provide only supported facts and page references.`,
            },
          ],
          {useHandbook: true},
        );
        if (
          handbookReply.status !== 'success' ||
          !handbookReply.data?.usedHandbook ||
          !handbookReply.data.sources.length
        )
          throw new Error(
            'No verified Handbook source was returned. Try a more specific prompt or turn off that source.',
          );
        context = `${handbookReply.data.reply}\n${context}`;
        citations = handbookReply.data.sources
          .map(s => `${s.title}${s.page ? `, p. ${s.page}` : ''}`)
          .join('; ');
      }
      if (userStore.getCurrentUser()?.id !== userId)
        throw new Error('This account is no longer active.');
      job.setProgress(1);
      const documentFormat = (selected?.attachment.format ||
        FORMAT_MAP[format]) as DocumentFormat;
      const prepared = buildSkillDocumentPrompt({
        prompt,
        format: documentFormat,
        length,
        context,
        citations,
        previous: selected
          ? {
              title: selected.title,
              summary: selected.summary,
              prompt: selected.originalPrompt || selected.prompt,
            }
          : undefined,
      });
      const result = await documentSkill.generate({
        format: documentFormat,
        prompt: prepared.prompt,
      });
      if (result.status !== 'success' || !result.data)
        throw new Error(
          result.error ||
            'The document service is unavailable. Please try again.',
        );
      if (userStore.getCurrentUser()?.id !== userId)
        throw new Error('This account is no longer active.');
      job.setProgress(2);
      const doc = result.data;
      const directory = `${
        RNFS.DocumentDirectoryPath
      }/skills_documents/${encodeURIComponent(userId)}`;
      await RNFS.mkdir(directory);
      const id = String(Date.now());
      const path = `${directory}/${id}_${doc.fileName}`;
      await RNFS.writeFile(path, doc.contentBase64, 'base64');
      const saved: SkillFile = {
        id,
        attachment: {
          uri: `file://${path}`,
          fileName: doc.fileName,
          format: doc.format,
          mimeType: doc.mimeType,
          sizeBytes: doc.sizeBytes,
        },
        title: doc.title,
        summary: doc.summary,
        createdAt: new Date().toISOString(),
        prompt,
        originalPrompt: selected?.originalPrompt || selected?.prompt || prompt,
        context: prepared.context,
        citations,
      };
      try {
        const recent = readSkillState<SkillFile[]>(userId, 'files', []);
        writeSkillState(userId, 'files', [saved, ...recent]);
      } catch (e) {
        await RNFS.unlink(path).catch(() => undefined);
        throw e;
      }
      job.setProgress(3);
      if (prepared.truncated)
        setNotice(
          `Saved. The document service used the first ${prepared.context.length} source characters.`,
        );
      return saved;
    });
  };
  const open = async (file: SkillFile) => {
    try {
      const module = NativeModules.LafinaSkillsFiles as {
        openFile: (path: string, mime: string) => Promise<boolean>;
      };
      if (!module?.openFile)
        throw new Error(
          'Opening files is unavailable in this build. Use Share.',
        );
      await module.openFile(file.attachment.uri, file.attachment.mimeType);
    } catch (e) {
      setNotice((e as Error).message);
    }
  };
  const share = async (file: SkillFile) => {
    const result = await shareAttachment(file.attachment);
    if (result !== 'shared')
      setNotice(
        result === 'Unavailable'
          ? 'This file is no longer on this phone. Generate it again.'
          : 'Could not share the file. Please try again.',
      );
  };
  if (job.busy)
    return (
      <View style={{paddingTop: 40, gap: 18}}>
        <View style={ui.center}>
          <SkillHalo>
            <Text style={{fontSize: 54, color: p.accent}}>✦</Text>
          </SkillHalo>
          <SkillText strong size={20}>
            Working on it…
          </SkillText>
          <SkillText muted center>
            You can leave this page. The file will appear here when ready.
          </SkillText>
        </View>
        <SkillCard>
          {[
            'Reading your sources',
            'Outlining, writing & formatting',
            'Saving on this phone',
          ].map((s, i) => (
            <View key={s} style={[ui.row, {minHeight: 52}]}>
              {i < stage ? (
                <SkillCheck />
              ) : (
                <Text
                  style={{
                    fontFamily: SkillFonts.semibold,
                    fontSize: 20,
                    color: p.accent,
                  }}
                >
                  {i === stage ? '◉' : '○'}
                </Text>
              )}
              <SkillText muted={i > stage} strong={i === stage}>
                {s}
              </SkillText>
            </View>
          ))}
        </SkillCard>
      </View>
    );
  return (
    <>
      {selected ? (
        <>
          <SkillCard>
            <SkillText strong size={17}>
              ✓ Your file is ready
            </SkillText>
            <View
              style={{
                backgroundColor: p.surface,
                borderRadius: 24,
                minHeight: 240,
                padding: 24,
                justifyContent: 'center',
                gap: 12,
              }}
            >
              <SkillText strong size={24}>
                {selected.title}
              </SkillText>
              <SkillText>{selected.summary}</SkillText>
              <SkillText muted size={12}>
                {!SKILLS_CAPABILITIES.embeddedOfficePreview
                  ? 'Summary preview. Open to view every page or slide.'
                  : 'Document preview'}
              </SkillText>
            </View>
            <SkillText strong>{selected.attachment.fileName}</SkillText>
            <SkillText muted size={12}>
              {Math.ceil((selected.attachment.sizeBytes ?? 0) / 1024)} KB ·
              Saved on this phone
            </SkillText>
          </SkillCard>
          <View style={ui.row}>
            <View style={ui.fill}>
              <SkillButton
                label="Open"
                onPress={() => {
                  void open(selected);
                }}
              />
            </View>
            <View style={ui.fill}>
              <SkillButton
                secondary
                label="Share"
                onPress={() => {
                  void share(selected);
                }}
              />
            </View>
          </View>
          <SkillInput
            label="Ask for changes"
            value={prompt}
            onChangeText={setPrompt}
            multiline
            maxLength={500}
          />
          <SkillButton secondary label="Generate revision" onPress={generate} />
          <SkillButton
            secondary
            label="Make something else"
            onPress={() => {
              setSelected(null);
              setPrompt('');
            }}
          />
        </>
      ) : (
        <>
          <Choices
            label="Format"
            values={['Slides (.pptx)', 'Document (.docx)', 'PDF'] as const}
            value={format}
            onChange={setFormat}
          />
          <SkillInput
            label="What would you like to make?"
            placeholder="Describe your document and who it is for"
            multiline
            maxLength={500}
            value={prompt}
            onChangeText={setPrompt}
            style={{minHeight: 128, textAlignVertical: 'top'}}
          />
          <SkillText muted size={12}>
            {prompt.length} / 500
          </SkillText>
          <SkillButton
            secondary
            label={dictating ? 'Stop dictation' : 'Dictate prompt'}
            onPress={() => {
              void dictate().catch(e => setNotice((e as Error).message));
            }}
          />
          <SourcePicker userId={userId} source={source} onChange={setSource} />
          <Choices
            label="Handbook source"
            values={['Off', 'USTP Handbook'] as const}
            value={handbook}
            onChange={setHandbook}
          />
          <Choices
            label="Length"
            values={['Short', 'Standard', 'Detailed'] as const}
            value={length}
            onChange={setLength}
          />
          <SkillText muted size={12}>
            The document service uses up to 2,500 source characters per request.
            Split longer material into smaller files.
          </SkillText>
          <SkillButton label="Generate with LAFINA" onPress={generate} />
        </>
      )}
      {!!job.error && <SkillText muted>{job.error}</SkillText>}
      {!!notice && <SkillText muted>{notice}</SkillText>}
      <View style={ui.section}>
        <SkillText strong size={17}>
          Recent files
        </SkillText>
      </View>
      {!files.length && (
        <SkillText muted>Your generated files will appear here.</SkillText>
      )}
      {files.map(file => (
        <SkillCard key={file.id}>
          <SkillText strong>{file.attachment.fileName}</SkillText>
          <SkillText muted size={12}>
            {new Date(file.createdAt).toLocaleDateString()}
          </SkillText>
          <SkillButton
            secondary
            label={`Preview ${file.title}`}
            onPress={() => {
              setSelected(file);
              setPrompt('');
            }}
          />
          <SkillButton
            secondary
            label={`Share ${file.title}`}
            onPress={() => {
              void share(file);
            }}
          />
        </SkillCard>
      ))}
    </>
  );
}
