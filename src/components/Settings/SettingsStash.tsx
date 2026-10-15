import Button from '@app/components/Common/Button';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import SensitiveInput from '@app/components/Common/SensitiveInput';
import useToasts from '@app/hooks/useToasts';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import {
  ArrowDownOnSquareIcon,
  BeakerIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import type { StashSettings } from '@server/lib/settings';
import axios from 'axios';
import { Field, Formik } from 'formik';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';
import * as Yup from 'yup';

const messages = defineMessages('components.Settings.SettingsStash', {
  stashSettings: 'Stash',
  stashSettingsDescription:
    'Optionally connect Stash as a library for scenes. Scenes that Stash has matched to StashDB are marked available and get a Play on Stash link. Find the API key under Settings → Security in Stash.',
  url: 'URL',
  apiKey: 'API Key',
  externalUrl: 'External URL',
  validationUrl: 'You must provide a valid URL',
  validationApiKey: 'You must provide an API key',
  toastTestSuccess: 'Connected to Stash {version}!',
  toastTestFailure: 'Failed to connect to Stash.',
  toastSaveSuccess: 'Stash settings saved successfully!',
  toastSaveFailure: 'Something went wrong while saving Stash settings.',
  manualscan: 'Manual Library Scan',
  manualscanDescription:
    'Seerr scans Stash on the Stash Scan job schedule, every 15 minutes by default. Run it now to mark scenes available that Stash has matched to StashDB or that are named after a StashDB id.',
  notrunning: 'Not Running',
  progress: '{progress} of {total}',
  startscan: 'Start Scan',
  cancelscan: 'Cancel Scan',
});

interface SyncStatus {
  running: boolean;
  progress: number;
  total: number;
}

const SettingsStash = () => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const [isTesting, setIsTesting] = useState(false);
  const { data, error, mutate } = useSWR<StashSettings>(
    '/api/v1/settings/stash'
  );
  const { data: sync, mutate: revalidateSync } = useSWR<SyncStatus>(
    '/api/v1/settings/stash/sync',
    { refreshInterval: (latest) => (latest?.running ? 1000 : 10000) }
  );

  const toggleScan = async (start: boolean) => {
    await axios.post('/api/v1/settings/stash/sync', {
      start,
      cancel: !start,
    });
    revalidateSync();
  };

  const schema = Yup.object().shape({
    url: Yup.string()
      .required(intl.formatMessage(messages.validationUrl))
      .url(intl.formatMessage(messages.validationUrl)),
    externalUrl: Yup.string().url(intl.formatMessage(messages.validationUrl)),
    apiKey: Yup.string().required(
      intl.formatMessage(messages.validationApiKey)
    ),
  });

  const testConnection = async (values: StashSettings) => {
    setIsTesting(true);
    try {
      const response = await axios.post<{ version: string }>(
        '/api/v1/settings/stash/test',
        values
      );
      addToast(
        intl.formatMessage(messages.toastTestSuccess, {
          version: response.data.version,
        }),
        { autoDismiss: true, appearance: 'success' }
      );
    } catch {
      addToast(intl.formatMessage(messages.toastTestFailure), {
        autoDismiss: true,
        appearance: 'error',
      });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <>
      <div className="mb-6">
        <h3 className="heading">{intl.formatMessage(messages.manualscan)}</h3>
        <p className="description">
          {intl.formatMessage(messages.manualscanDescription)}
        </p>
      </div>
      <div className="section">
        <div className="rounded-md bg-gray-800 p-4">
          <div className="relative mb-6 h-8 w-full overflow-hidden rounded-full bg-gray-600">
            {sync?.running && (
              <div
                className="h-8 bg-indigo-600 transition-all duration-200 ease-in-out"
                style={{
                  width: `${
                    sync.total
                      ? Math.round((sync.progress / sync.total) * 100)
                      : 0
                  }%`,
                }}
              />
            )}
            <div className="absolute inset-0 flex h-8 w-full items-center justify-center text-sm">
              <span>
                {sync?.running
                  ? intl.formatMessage(messages.progress, {
                      progress: sync.progress,
                      total: sync.total,
                    })
                  : intl.formatMessage(messages.notrunning)}
              </span>
            </div>
          </div>
          <div className="flex w-full justify-end">
            {sync?.running ? (
              <Button buttonType="danger" onClick={() => toggleScan(false)}>
                <XMarkIcon />
                <span>{intl.formatMessage(messages.cancelscan)}</span>
              </Button>
            ) : (
              <Button
                buttonType="warning"
                disabled={!data?.url}
                onClick={() => toggleScan(true)}
              >
                <MagnifyingGlassIcon />
                <span>{intl.formatMessage(messages.startscan)}</span>
              </Button>
            )}
          </div>
        </div>
      </div>
      <div className="mb-6 mt-10">
        <h3 className="heading">
          {intl.formatMessage(messages.stashSettings)}
        </h3>
        <p className="description">
          {intl.formatMessage(messages.stashSettingsDescription)}
        </p>
      </div>
      {!data && !error ? (
        <LoadingSpinner />
      ) : (
        <Formik
          initialValues={{
            url: data?.url ?? '',
            apiKey: data?.apiKey ?? '',
            externalUrl: data?.externalUrl ?? '',
          }}
          enableReinitialize
          validationSchema={schema}
          onSubmit={async (values) => {
            try {
              await axios.post('/api/v1/settings/stash', values);
              addToast(intl.formatMessage(messages.toastSaveSuccess), {
                autoDismiss: true,
                appearance: 'success',
              });
            } catch {
              addToast(intl.formatMessage(messages.toastSaveFailure), {
                autoDismiss: true,
                appearance: 'error',
              });
            } finally {
              mutate();
            }
          }}
        >
          {({
            errors,
            touched,
            values,
            handleSubmit,
            isSubmitting,
            isValid,
          }) => (
            <form className="section" onSubmit={handleSubmit}>
              <div className="form-row">
                <label htmlFor="stashUrl" className="text-label">
                  {intl.formatMessage(messages.url)}
                  <span className="label-required">*</span>
                </label>
                <div className="form-input-area">
                  <div className="form-input-field">
                    <Field
                      type="text"
                      inputMode="url"
                      id="stashUrl"
                      name="url"
                    />
                  </div>
                  {errors.url && touched.url && (
                    <div className="error">{errors.url}</div>
                  )}
                </div>
              </div>
              <div className="form-row">
                <label htmlFor="stashApiKey" className="text-label">
                  {intl.formatMessage(messages.apiKey)}
                  <span className="label-required">*</span>
                </label>
                <div className="form-input-area">
                  <div className="form-input-field">
                    <SensitiveInput as="field" id="stashApiKey" name="apiKey" />
                  </div>
                  {errors.apiKey && touched.apiKey && (
                    <div className="error">{errors.apiKey}</div>
                  )}
                </div>
              </div>
              <div className="form-row">
                <label htmlFor="stashExternalUrl" className="text-label">
                  {intl.formatMessage(messages.externalUrl)}
                </label>
                <div className="form-input-area">
                  <div className="form-input-field">
                    <Field
                      type="text"
                      inputMode="url"
                      id="stashExternalUrl"
                      name="externalUrl"
                    />
                  </div>
                  {errors.externalUrl && touched.externalUrl && (
                    <div className="error">{errors.externalUrl}</div>
                  )}
                </div>
              </div>
              <div className="actions">
                <div className="flex justify-end">
                  <span className="ml-3 inline-flex rounded-md shadow-sm">
                    <Button
                      buttonType="warning"
                      type="button"
                      disabled={isSubmitting || isTesting || !isValid}
                      onClick={() => testConnection(values)}
                    >
                      <BeakerIcon />
                      <span>
                        {isTesting
                          ? intl.formatMessage(globalMessages.testing)
                          : intl.formatMessage(globalMessages.test)}
                      </span>
                    </Button>
                  </span>
                  <span className="ml-3 inline-flex rounded-md shadow-sm">
                    <Button
                      buttonType="primary"
                      type="submit"
                      disabled={isSubmitting || isTesting || !isValid}
                    >
                      <ArrowDownOnSquareIcon />
                      <span>
                        {isSubmitting
                          ? intl.formatMessage(globalMessages.saving)
                          : intl.formatMessage(globalMessages.save)}
                      </span>
                    </Button>
                  </span>
                </div>
              </div>
            </form>
          )}
        </Formik>
      )}
    </>
  );
};

export default SettingsStash;
