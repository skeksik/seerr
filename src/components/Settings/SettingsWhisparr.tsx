import Alert from '@app/components/Common/Alert';
import Button from '@app/components/Common/Button';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import Modal from '@app/components/Common/Modal';
import { ServerInstance } from '@app/components/Settings/SettingsServices';
import WhisparrModal from '@app/components/Settings/WhisparrModal';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import { Transition } from '@headlessui/react';
import { VideoCameraIcon } from '@heroicons/react/24/outline';
import { PlusIcon } from '@heroicons/react/24/solid';
import type { WhisparrSettings } from '@server/lib/settings';
import axios from 'axios';
import { Fragment, useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.Settings.SettingsWhisparr', {
  whisparrsettings: 'Whisparr Settings',
  whisparrDescription:
    'Configure your Whisparr v3 server(s) below. Scene requests and adult movie requests are sent to Whisparr. Mark one server as default to process them.',
  addwhisparr: 'Add Whisparr Server',
  noDefaultServer:
    'At least one Whisparr server must be marked as default in order for scene and adult movie requests to be processed.',
  deleteServer: 'Delete Whisparr Server',
  deleteserverconfirm: 'Are you sure you want to delete this server?',
});

const SettingsWhisparr = () => {
  const intl = useIntl();
  const { data, error, mutate } = useSWR<WhisparrSettings[]>(
    '/api/v1/settings/whisparr'
  );
  const [editModal, setEditModal] = useState<{
    open: boolean;
    whisparr: WhisparrSettings | null;
  }>({ open: false, whisparr: null });
  const [deleteServerId, setDeleteServerId] = useState<number | null>(null);

  const deleteServer = async () => {
    await axios.delete(`/api/v1/settings/whisparr/${deleteServerId}`);
    setDeleteServerId(null);
    mutate();
  };

  return (
    <>
      <div className="mb-6 mt-10">
        <h3 className="heading">
          {intl.formatMessage(messages.whisparrsettings)}
        </h3>
        <p className="description">
          {intl.formatMessage(messages.whisparrDescription)}
        </p>
      </div>
      {editModal.open && (
        <WhisparrModal
          whisparr={editModal.whisparr}
          onClose={() => setEditModal({ open: false, whisparr: null })}
          onSave={() => {
            mutate();
            setEditModal({ open: false, whisparr: null });
          }}
        />
      )}
      <Transition
        as={Fragment}
        show={deleteServerId !== null}
        enter="transition-opacity ease-in-out duration-300"
        enterFrom="opacity-0"
        enterTo="opacity-100"
        leave="transition-opacity ease-in-out duration-300"
        leaveFrom="opacity-100"
        leaveTo="opacity-0"
      >
        <Modal
          okText={intl.formatMessage(globalMessages.delete)}
          okButtonType="danger"
          onOk={() => deleteServer()}
          onCancel={() => setDeleteServerId(null)}
          title={intl.formatMessage(messages.deleteServer)}
        >
          {intl.formatMessage(messages.deleteserverconfirm)}
        </Modal>
      </Transition>
      <div className="section">
        {!data && !error && <LoadingSpinner />}
        {data && !error && (
          <>
            {data.length > 0 && !data.some((server) => server.isDefault) && (
              <Alert title={intl.formatMessage(messages.noDefaultServer)} />
            )}
            <ul className="grid max-w-6xl grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
              {data.map((whisparr) => (
                <ServerInstance
                  key={`whisparr-config-${whisparr.id}`}
                  name={whisparr.name}
                  hostname={whisparr.hostname}
                  port={whisparr.port}
                  profileName={whisparr.activeProfileName}
                  isSSL={whisparr.useSsl}
                  isDefault={whisparr.isDefault}
                  is4k={whisparr.is4k}
                  externalUrl={whisparr.externalUrl}
                  logo={
                    <VideoCameraIcon className="h-10 w-10 flex-shrink-0 text-pink-400" />
                  }
                  onEdit={() => setEditModal({ open: true, whisparr })}
                  onDelete={() => setDeleteServerId(whisparr.id)}
                />
              ))}
              <li className="col-span-1 h-32 rounded-lg border-2 border-dashed border-gray-400 shadow sm:h-44">
                <div className="flex h-full w-full items-center justify-center">
                  <Button
                    buttonType="ghost"
                    className="mb-3 mt-3"
                    onClick={() => setEditModal({ open: true, whisparr: null })}
                  >
                    <PlusIcon />
                    <span>{intl.formatMessage(messages.addwhisparr)}</span>
                  </Button>
                </div>
              </li>
            </ul>
          </>
        )}
      </div>
    </>
  );
};

export default SettingsWhisparr;
