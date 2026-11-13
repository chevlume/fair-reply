import React, { useCallback, useEffect, useState } from 'react';
import ForgeReconciler, {
  Box,
  Button,
  Heading,
  Inline,
  List,
  ListItem,
  Lozenge,
  SectionMessage,
  Spinner,
  Stack,
  Label,
  Text,
  TextArea,
} from '@forge/react';
import { events, invoke } from '@forge/bridge';
import { pointReplyLine } from '../detect/coverage';
import { confirmButtonHint, readTextAreaValue } from '../panel/confirm';
import type { PanelModel } from '../panel/model';

const App = () => {
  const [model, setModel] = useState<PanelModel | null>(null);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const confirm = confirmButtonHint(reason, busy);

  const load = useCallback(async () => {
    const next = (await invoke('getPanel')) as PanelModel;
    setModel(next);
  }, []);

  useEffect(() => {
    void load();
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    events
      .on('JIRA_ISSUE_CHANGED', () => {
        void load();
      })
      .then((subscription) => {
        if (cancelled) subscription.unsubscribe();
        else unsubscribe = () => subscription.unsubscribe();
      })
      .catch(() => {
        // The bridge is only present inside Jira.
      });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [load]);

  const decide = async (action: 'confirmComplaint' | 'dismissComplaint') => {
    if (!reason.trim()) return;
    setBusy(true);
    try {
      const next = (await invoke(action, { reason: reason.trim() })) as PanelModel;
      setModel(next);
      setReason('');
    } finally {
      setBusy(false);
    }
  };

  if (!model) {
    return (
      <Stack space="space.100">
        <Spinner />
        <Text>Reading this request…</Text>
      </Stack>
    );
  }

  if (model.state === 'error') {
    return (
      <Stack space="space.150">
        <Heading size="small">Fair Reply</Heading>
        <SectionMessage appearance="error" title="Could not load this request">
          <Text>{model.errorMessage}</Text>
        </SectionMessage>
        <Text>Try opening the panel again. Nothing was classified.</Text>
        <Text weight="bold">{model.shortDisclaimer}</Text>
      </Stack>
    );
  }

  const complaint = model.phase === 'detected' || model.phase === 'confirmed';
  const lozenge = model.phase === 'confirmed' || model.phase === 'detected'
    ? 'removed'
    : model.phase === 'waiting'
      ? 'inprogress'
      : 'success';

  return (
    <Stack space="space.200">
      <Heading size="small">Fair Reply</Heading>
      <Inline space="space.100" alignBlock="center" shouldWrap>
        <Lozenge appearance={model.headline === 'Ready to close' ? 'success' : model.headline === 'Not a complaint' ? 'success' : lozenge}>
          {model.headline}
        </Lozenge>
        {model.clockBadge ? <Lozenge appearance="removed">{model.clockBadge}</Lozenge> : null}
        <Lozenge appearance={model.phase === 'detected' ? 'inprogress' : 'default'}>{model.statusLine}</Lozenge>
      </Inline>

      {model.article137Reminder ? <Text>{model.article137Reminder}</Text> : null}
      {model.article136Reminder ? <Text>{model.article136Reminder}</Text> : null}
      <Text>{model.enforcementLine}</Text>
      {model.gapsWarning ? <Text>{model.gapsWarning}</Text> : null}

      <Text weight="bold">Why we think this</Text>
      {complaint && model.showQuote && model.quote ? (
        <Box backgroundColor="color.background.accent.red.subtlest" padding="space.150">
          <Stack space="space.050">
            <Text weight="bold">{model.quoteLabel}</Text>
            <Text>{model.quote}</Text>
          </Stack>
        </Box>
      ) : (
        <Text>{model.phase === 'waiting' ? 'Not read yet.' : model.statusLine}</Text>
      )}

      <Text weight="bold">{model.clockHeading}</Text>
      {complaint ? <Text weight="bold">{model.deadlineLabel}</Text> : <Text>{model.deadlineLabel}</Text>}
      {model.obligationLine ? <Text>{model.obligationLine}</Text> : null}
      {complaint && model.whyClock ? <Text>{model.whyClock}</Text> : null}
      <Text>{model.createdAssumption}</Text>

      {model.missingHeading ? <Text weight="bold">{model.missingHeading}</Text> : null}
      {complaint && model.showPoints ? (
        <Stack space="space.100">
          <Text weight="bold">
            {model.unansweredCount === 0
              ? 'Every customer point is answered'
              : `${model.unansweredCount} unanswered`}
          </Text>
          <List type="ordered">
            {model.points.map((point, index) => {
              const replyLine = pointReplyLine(point.answered, point.fragment);
              return (
                <ListItem key={`${index}-${point.text}`}>
                  <Text>
                    {point.answered ? 'Answered' : 'Unanswered'} — {point.text}
                    {replyLine ? ` ${replyLine}` : ''}
                  </Text>
                </ListItem>
              );
            })}
          </List>
        </Stack>
      ) : null}

      {model.confirmationHistory ? <Text>{model.confirmationHistory}</Text> : null}

      {model.phase === 'overridden' ? (
        <Text>A person overruled the detector. The complaint clock is cleared. Confirm again if that was a mistake.</Text>
      ) : null}

      {model.phase === 'waiting' ? (
        <Text>Classification runs after the request is created. Nothing here is a legal conclusion.</Text>
      ) : null}

      {model.showDraft && model.draftText ? (
        <Stack space="space.050">
          <Text weight="bold">Draft acknowledgement</Text>
          <Text>{model.draftText}</Text>
          {model.draftAgentNote ? (
            <Stack space="space.050">
              <Text weight="bold">For the agent, not the customer</Text>
              <Text>{model.draftAgentNote}</Text>
            </Stack>
          ) : null}
        </Stack>
      ) : null}

      <Text weight="bold">Next step</Text>
      <Text>{model.nextStep}</Text>

      <Label labelFor="confirmation-reason">Why this decision</Label>
      <TextArea
        id="confirmation-reason"
        name="confirmation-reason"
        placeholder="Say why you confirm or overrule this reading"
        value={reason}
        onChange={(event) => {
          setReason(readTextAreaValue(event));
        }}
      />
      {confirm.hint ? <Text>{confirm.hint}</Text> : null}
      <Stack space="space.100">
        <Button appearance="primary" isDisabled={confirm.disabled} onClick={() => void decide('confirmComplaint')}>
          Confirm complaint
        </Button>
        <Button appearance="subtle" isDisabled={confirm.disabled} onClick={() => void decide('dismissComplaint')}>
          Not a complaint
        </Button>
      </Stack>

      <Text>{model.scopeLine}</Text>
      <Text weight="bold">{model.shortDisclaimer}</Text>
    </Stack>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
