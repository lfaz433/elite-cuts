import React from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';
import WorkerInviteDialogView, {
  type CreateWorkerInvitationInput,
  type WorkerInviteDialogProps,
} from './WorkerInviteDialogView';

interface CreateWorkerInvitationResult {
  invitationId: string;
}

const createWorkerInvitation = httpsCallable<
  CreateWorkerInvitationInput,
  CreateWorkerInvitationResult
>(functions, 'createWorkerInvitation');

export default function WorkerInviteDialog(props: WorkerInviteDialogProps) {
  return (
    <WorkerInviteDialogView
      {...props}
      createInvitation={async input => (await createWorkerInvitation(input)).data}
    />
  );
}
