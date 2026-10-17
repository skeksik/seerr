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
import { Fragment, useState } from 'react';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.Scenes.MonitorControls', {
  openinwhisparr: 'Open in Whisparr',
  monitor: 'Monitor in Whisparr',
  monitored: 'Monitored in Whisparr',
  scenesMonitored: 'Scenes Monitored',
  moviesMonitored: 'Movies Monitored',
  monitorMovies: 'Monitor Movies',
  monitorScenes: 'Monitor Scenes',
  unmonitor: 'Stop Monitoring',
  monitorTitle: 'Monitor {name}',
  monitorAll:
    'Whisparr will add every scene and movie {type, select, performer {with} other {from}} {name} and download new ones as they are released.',
  monitorMaybeMovies:
    "Whisparr will add every scene {type, select, performer {with} other {from}} {name} and download new ones as they are released. It adds their movies too if StashDB links {name} to Whisparr's movie metadata source.",
  monitorScenesOnly:
    "Whisparr will add every scene {type, select, performer {with} other {from}} {name} and download new ones as they are released. It cannot add their movies, as StashDB does not link {name} to Whisparr's movie metadata source.",
  searchExisting: 'Search for existing titles now',
  searchExistingTip:
    'Starts a search for every scene and movie that is not downloaded yet. This can queue a lot of downloads.',
  monitorSuccess: 'Whisparr is now monitoring <strong>{name}</strong>.',
  unmonitorSuccess: 'Whisparr stopped monitoring <strong>{name}</strong>.',
  monitorError: 'Something went wrong while updating Whisparr.',
});

interface MonitorControlsProps {
  type: 'performer' | 'studio';
  id: string;
  name: string;
  status: WhisparrMonitorStatus;
  // Whether StashDB links them to ThePornDB, which Whisparr's movies take,
  // for the confirmation before Whisparr follows them
  moviesLinked?: boolean;
  onChange: (status: WhisparrMonitorStatus) => void;
}

// Whisparr monitoring of a StashDB performer or studio: their scenes, and their
// movies where Whisparr can add them
const MonitorControls = ({
  type,
  id,
  name,
  status,
  moviesLinked,
  onChange,
}: MonitorControlsProps) => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const [showConfirm, setShowConfirm] = useState(false);
  const [search, setSearch] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const anyMonitored = status.monitored || status.moviesMonitored;
  // Scenes, and movies unless Whisparr cannot add them
  const fullyMonitored =
    status.monitored &&
    (status.moviesMonitored || status.moviesAvailable !== true);
  // Whisparr's word once it follows them; until then, a missing link
  // settles it, as Whisparr cannot find the movies without one
  const moviesAvailable =
    status.moviesAvailable ?? (moviesLinked === false ? false : undefined);
  const description =
    moviesAvailable === true
      ? messages.monitorAll
      : moviesAvailable === false
        ? messages.monitorScenesOnly
        : messages.monitorMaybeMovies;

  // Every label the button can show takes the same cell, the others kept
  // invisible, so it keeps one width whatever it says and doesn't slip from
  // under the cursor when hovering swaps its label
  const stateLabels = [
    messages.monitor,
    messages.monitored,
    messages.scenesMonitored,
    messages.moviesMonitored,
    messages.unmonitor,
  ];
  const stateLabel = (
    shown: (typeof stateLabels)[number],
    stopOnHover: boolean
  ) => (
    <span className="grid">
      {stateLabels.map((label) => (
        <span
          key={label.id}
          aria-hidden={label !== shown}
          className={`col-start-1 row-start-1 ${
            label === shown
              ? stopOnHover
                ? 'group-hover:invisible'
                : ''
              : stopOnHover && label === messages.unmonitor
                ? 'invisible group-hover:visible'
                : 'invisible'
          }`}
        >
          {intl.formatMessage(label)}
        </span>
      ))}
    </span>
  );

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
      {/* A fragment, as a wrapper would join the button row and shift it */}
      <Transition
        as={Fragment}
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
            {intl.formatMessage(description, { type, name })}
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
      {anyMonitored ? (
        <Button
          buttonType="success"
          disabled={isUpdating}
          onClick={() => update(false)}
          className="group"
          title={intl.formatMessage(messages.unmonitor)}
        >
          <CheckIcon className="group-hover:hidden" />
          <EyeSlashIcon className="hidden group-hover:block" />
          {stateLabel(
            fullyMonitored
              ? messages.monitored
              : status.monitored
                ? messages.scenesMonitored
                : messages.moviesMonitored,
            true
          )}
        </Button>
      ) : (
        <Button
          buttonType="primary"
          disabled={isUpdating}
          onClick={() => setShowConfirm(true)}
        >
          <EyeIcon />
          {stateLabel(messages.monitor, false)}
        </Button>
      )}
      {/* Monitoring completes the half Whisparr does not monitor yet */}
      {anyMonitored && !fullyMonitored && (
        <Button
          buttonType="primary"
          disabled={isUpdating}
          onClick={() => setShowConfirm(true)}
        >
          <EyeIcon />
          <span>
            {intl.formatMessage(
              status.monitored ? messages.monitorMovies : messages.monitorScenes
            )}
          </span>
        </Button>
      )}
    </>
  );
};

export default MonitorControls;
