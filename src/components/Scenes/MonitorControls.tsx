import Button from '@app/components/Common/Button';
import Modal from '@app/components/Common/Modal';
import useToasts from '@app/hooks/useToasts';
import defineMessages from '@app/utils/defineMessages';
import { Transition } from '@headlessui/react';
import {
  ArrowTopRightOnSquareIcon,
  CheckIcon,
  EyeIcon,
  EyeSlashIcon,
} from '@heroicons/react/24/solid';
import type { WhisparrMonitorStatus } from '@server/models/Scene';
import axios from 'axios';
import { useState } from 'react';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.Scenes.MonitorControls', {
  openinwhisparr: 'Open in Whisparr',
  monitor: 'Monitor in Whisparr',
  monitored: 'Monitored in Whisparr',
  unmonitor: 'Stop Monitoring',
  monitorTitle: 'Monitor {name}',
  monitorPerformer:
    'Whisparr will add every scene with {name} and download new scenes as they are released.',
  monitorStudio:
    'Whisparr will add every scene from {name} and download new scenes as they are released.',
  searchExisting: 'Search for existing scenes now',
  searchExistingTip:
    'Starts a search for every scene that is not downloaded yet. This can queue a lot of downloads.',
  monitorSuccess: 'Whisparr is now monitoring <strong>{name}</strong>.',
  unmonitorSuccess: 'Whisparr stopped monitoring <strong>{name}</strong>.',
  monitorError: 'Something went wrong while updating Whisparr.',
});

interface MonitorControlsProps {
  type: 'performer' | 'studio';
  id: string;
  name: string;
  status: WhisparrMonitorStatus;
  onChange: (status: WhisparrMonitorStatus) => void;
}

// Whisparr monitoring of a StashDB performer or studio
const MonitorControls = ({
  type,
  id,
  name,
  status,
  onChange,
}: MonitorControlsProps) => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const [showConfirm, setShowConfirm] = useState(false);
  const [search, setSearch] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const update = async (monitored: boolean) => {
    setIsUpdating(true);

    try {
      const { data } = await axios.post<WhisparrMonitorStatus>(
        `/api/v1/scene/${type}/${id}/monitor`,
        { monitored, search: monitored && search }
      );
      onChange(data);
      setShowConfirm(false);
      addToast(
        intl.formatMessage(
          monitored ? messages.monitorSuccess : messages.unmonitorSuccess,
          { name, strong: (msg: React.ReactNode) => <strong>{msg}</strong> }
        ),
        { appearance: 'success', autoDismiss: true }
      );
    } catch {
      addToast(intl.formatMessage(messages.monitorError), {
        appearance: 'error',
        autoDismiss: true,
      });
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <>
      <Transition
        as="div"
        show={showConfirm}
        enter="transition-opacity duration-300"
        enterFrom="opacity-0"
        enterTo="opacity-100"
        leave="transition-opacity duration-300"
        leaveFrom="opacity-100"
        leaveTo="opacity-0"
      >
        <Modal
          title={intl.formatMessage(messages.monitorTitle, { name })}
          onCancel={() => setShowConfirm(false)}
          onOk={() => update(true)}
          okText={intl.formatMessage(messages.monitor)}
          okButtonType="primary"
          okDisabled={isUpdating}
          backgroundClickable
        >
          <p className="text-gray-300">
            {intl.formatMessage(
              type === 'performer'
                ? messages.monitorPerformer
                : messages.monitorStudio,
              { name }
            )}
          </p>
          <div className="mt-4 flex items-start space-x-3">
            <input
              id="searchExisting"
              type="checkbox"
              className="mt-1"
              checked={search}
              onChange={() => setSearch((s) => !s)}
            />
            <label htmlFor="searchExisting">
              <span className="text-white">
                {intl.formatMessage(messages.searchExisting)}
              </span>
              <span className="block text-sm text-gray-400">
                {intl.formatMessage(messages.searchExistingTip)}
              </span>
            </label>
          </div>
        </Modal>
      </Transition>
      <a href={status.serviceUrl} target="_blank" rel="noreferrer">
        <Button buttonType="ghost">
          <ArrowTopRightOnSquareIcon />
          <span>{intl.formatMessage(messages.openinwhisparr)}</span>
        </Button>
      </a>
      {status.monitored ? (
        <Button
          buttonType="success"
          disabled={isUpdating}
          onClick={() => update(false)}
          className="group"
          title={intl.formatMessage(messages.unmonitor)}
        >
          <CheckIcon className="group-hover:hidden" />
          <EyeSlashIcon className="hidden group-hover:block" />
          <span className="group-hover:hidden">
            {intl.formatMessage(messages.monitored)}
          </span>
          <span className="hidden group-hover:inline">
            {intl.formatMessage(messages.unmonitor)}
          </span>
        </Button>
      ) : (
        <Button
          buttonType="primary"
          disabled={isUpdating}
          onClick={() => setShowConfirm(true)}
        >
          <EyeIcon />
          <span>{intl.formatMessage(messages.monitor)}</span>
        </Button>
      )}
    </>
  );
};

export default MonitorControls;
