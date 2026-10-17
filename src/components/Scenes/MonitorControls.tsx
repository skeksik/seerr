import Badge from '@app/components/Common/Badge';
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
import type {
  SceneChildStudio,
  WhisparrMonitorStatus,
} from '@server/models/Scene';
import axios from 'axios';
import { Fragment, useState } from 'react';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.Scenes.MonitorControls', {
  openinwhisparr: 'Open in Whisparr',
  monitor: 'Monitor in Whisparr',
  monitored: 'Monitored in Whisparr',
  scenesMonitored: 'Scenes Monitored',
  moviesMonitored: 'Movies Monitored',
  unmonitor: 'Stop Monitoring',
  save: 'Save',
  monitorTitle: 'Monitor {name}',
  intro:
    'Whisparr adds every scene and movie {type, select, performer {with} other {from}} {name} it monitors here, and picks new ones up as they are released.',
  monitorScenes: 'Monitor scenes',
  monitorMovies: 'Monitor movies',
  monitorNewItems: 'Monitor new items',
  studios: 'Studios',
  studiosTip:
    'Whisparr follows studios rather than networks, so the options above apply to {name} and to each studio picked here.',
  selectAll: 'Select all',
  selectNone: 'None',
  tpdbLinked: 'ThePornDB',
  searchExisting: 'Search for existing titles now',
  searchExistingTip:
    'Starts a search for every scene and movie that is not downloaded yet. This can queue a lot of downloads.',
  monitorSuccess: 'Whisparr is now monitoring <strong>{name}</strong>.',
  unmonitorSuccess: 'Whisparr stopped monitoring <strong>{name}</strong>.',
  studiosFailed:
    'Whisparr could not update {count, plural, one {# studio} other {# studios}}.',
  monitorError: 'Something went wrong while updating Whisparr.',
});

export interface MonitorStudioStatus {
  id: string;
  monitored: boolean;
  moviesMonitored: boolean;
}

type MonitorResponse = WhisparrMonitorStatus & {
  studios?: MonitorStudioStatus[];
  failed?: string[];
};

interface MonitorControlsProps {
  type: 'performer' | 'studio';
  id: string;
  name: string;
  status: WhisparrMonitorStatus;
  // A network's studios, which Whisparr follows in its place
  studios?: SceneChildStudio[];
  onChange: (
    status: WhisparrMonitorStatus,
    studios?: MonitorStudioStatus[]
  ) => void;
}

const isMonitored = (status?: {
  monitored: boolean;
  moviesMonitored: boolean;
}) => !!status && (status.monitored || status.moviesMonitored);

interface OptionProps {
  id: string;
  checked: boolean;
  onChange: () => void;
  label: string;
  tip?: string;
}

const Option = ({ id, checked, onChange, label, tip }: OptionProps) => (
  <div className="flex items-start space-x-3">
    <input
      id={id}
      type="checkbox"
      className="mt-1"
      checked={checked}
      onChange={onChange}
    />
    <label htmlFor={id}>
      <span className="text-white">{label}</span>
      {tip && <span className="block text-sm text-gray-400">{tip}</span>}
    </label>
  </div>
);

// Whisparr monitoring of a StashDB performer or studio: their scenes, their
// movies where Whisparr can add them, and new releases; for a network, of
// the studios under it too
const MonitorControls = ({
  type,
  id,
  name,
  status,
  studios = [],
  onChange,
}: MonitorControlsProps) => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const [showDialog, setShowDialog] = useState(false);
  const [scenes, setScenes] = useState(false);
  const [movies, setMovies] = useState(false);
  const [newItems, setNewItems] = useState(true);
  const [search, setSearch] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [isUpdating, setIsUpdating] = useState(false);
  const isNetwork = type === 'studio' && studios.length > 0;
  const anyMonitored = isMonitored(status);
  // Scenes, and movies unless Whisparr cannot add them
  const fullyMonitored =
    status.monitored &&
    (status.moviesMonitored || status.moviesAvailable !== true);
  // Whether the dialog has anything to stop
  const anyPickedMonitored =
    anyMonitored ||
    studios.some(
      (studio) => picked.has(studio.id) && isMonitored(studio.whisparr)
    );

  // Starts from what Whisparr monitors now, the studios it follows picked
  const openDialog = () => {
    setScenes(status.monitored);
    setMovies(status.moviesMonitored);
    setNewItems(status.monitorNewItems);
    setSearch(status.searchOnAdd);
    setPicked(
      new Set(
        studios
          .filter((studio) => isMonitored(studio.whisparr))
          .map((studio) => studio.id)
      )
    );
    setShowDialog(true);
  };

  const togglePicked = (studioId: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (!next.delete(studioId)) {
        next.add(studioId);
      }
      return next;
    });

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

  const update = async (options: {
    scenes: boolean;
    movies: boolean;
    search: boolean;
  }) => {
    setIsUpdating(true);

    try {
      const { data } = await axios.post<MonitorResponse>(
        `/api/v1/scene/${type}/${id}/monitor`,
        {
          ...options,
          monitorNewItems: newItems,
          ...(isNetwork && { studios: [...picked] }),
        }
      );
      const { studios: applied, failed, ...next } = data;
      onChange(next, applied);
      setShowDialog(false);
      addToast(
        intl.formatMessage(
          options.scenes || options.movies
            ? messages.monitorSuccess
            : messages.unmonitorSuccess,
          { name, strong: (msg: React.ReactNode) => <strong>{msg}</strong> }
        ),
        { appearance: 'success', autoDismiss: true }
      );
      if (failed?.length) {
        addToast(
          intl.formatMessage(messages.studiosFailed, { count: failed.length }),
          { appearance: 'error', autoDismiss: true }
        );
      }
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
        show={showDialog}
        enter="transition-opacity duration-300"
        enterFrom="opacity-0"
        enterTo="opacity-100"
        leave="transition-opacity duration-300"
        leaveFrom="opacity-100"
        leaveTo="opacity-0"
      >
        <Modal
          title={intl.formatMessage(messages.monitorTitle, { name })}
          onCancel={() => setShowDialog(false)}
          onOk={() => update({ scenes, movies, search })}
          okText={intl.formatMessage(messages.save)}
          okButtonType="primary"
          okDisabled={isUpdating}
          onSecondary={
            anyPickedMonitored
              ? () => update({ scenes: false, movies: false, search: false })
              : undefined
          }
          secondaryText={intl.formatMessage(messages.unmonitor)}
          secondaryButtonType="danger"
          secondaryDisabled={isUpdating}
          backgroundClickable
        >
          <p className="text-gray-300">
            {intl.formatMessage(messages.intro, { type, name })}
          </p>
          <div className="mt-4 space-y-3">
            <Option
              id="monitorScenes"
              checked={scenes}
              onChange={() => setScenes((on) => !on)}
              label={intl.formatMessage(messages.monitorScenes)}
            />
            <Option
              id="monitorMovies"
              checked={movies}
              onChange={() => setMovies((on) => !on)}
              label={intl.formatMessage(messages.monitorMovies)}
            />
            <Option
              id="monitorNewItems"
              checked={newItems}
              onChange={() => setNewItems((on) => !on)}
              label={intl.formatMessage(messages.monitorNewItems)}
            />
            {isNetwork && (
              <div>
                <div className="flex items-baseline justify-between">
                  <span className="text-white">
                    {intl.formatMessage(messages.studios)}
                  </span>
                  <span className="space-x-2 text-sm">
                    <button
                      type="button"
                      className="text-indigo-400 hover:text-indigo-300"
                      onClick={() =>
                        setPicked(new Set(studios.map((studio) => studio.id)))
                      }
                    >
                      {intl.formatMessage(messages.selectAll)}
                    </button>
                    <span className="text-gray-500">/</span>
                    <button
                      type="button"
                      className="text-indigo-400 hover:text-indigo-300"
                      onClick={() => setPicked(new Set())}
                    >
                      {intl.formatMessage(messages.selectNone)}
                    </button>
                  </span>
                </div>
                <p className="text-sm text-gray-400">
                  {intl.formatMessage(messages.studiosTip, { name })}
                </p>
                <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto rounded-md border border-gray-700 bg-gray-900 p-2">
                  {studios.map((studio) => (
                    <li key={studio.id}>
                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={picked.has(studio.id)}
                          onChange={() => togglePicked(studio.id)}
                        />
                        <span className="text-white">{studio.name}</span>
                        {studio.tpdbLinked && (
                          <Badge badgeType="dark">
                            {intl.formatMessage(messages.tpdbLinked)}
                          </Badge>
                        )}
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <Option
              id="searchExisting"
              checked={search}
              onChange={() => setSearch((on) => !on)}
              label={intl.formatMessage(messages.searchExisting)}
              tip={intl.formatMessage(messages.searchExistingTip)}
            />
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
          onClick={openDialog}
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
        <Button buttonType="primary" disabled={isUpdating} onClick={openDialog}>
          <EyeIcon />
          {stateLabel(messages.monitor, false)}
        </Button>
      )}
    </>
  );
};

export default MonitorControls;
