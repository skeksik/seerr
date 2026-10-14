import Button from '@app/components/Common/Button';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import SensitiveInput from '@app/components/Common/SensitiveInput';
import useToasts from '@app/hooks/useToasts';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import { ArrowDownOnSquareIcon, BeakerIcon } from '@heroicons/react/24/outline';
import type { StashDbSettings } from '@server/lib/settings';
import axios from 'axios';
import { Field, Formik } from 'formik';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';
import * as Yup from 'yup';

const messages = defineMessages('components.Settings.SettingsStashDb', {
  stashdbSettings: 'StashDB',
  stashdbSettingsDescription:
    'Scene metadata comes from StashDB or another stash-box instance. Create an API key on your StashDB profile page. Scenes are only shown while adult content is enabled.',
  endpoint: 'GraphQL Endpoint',
  apiKey: 'API Key',
  validationEndpoint: 'You must provide a valid URL',
  validationApiKey: 'You must provide an API key',
  toastTestSuccess: 'Connected to StashDB {version}!',
  toastTestFailure: 'Failed to connect to StashDB.',
  toastSaveSuccess: 'StashDB settings saved successfully!',
  toastSaveFailure: 'Something went wrong while saving StashDB settings.',
});

const SettingsStashDb = () => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const [isTesting, setIsTesting] = useState(false);
  const { data, error, mutate } = useSWR<StashDbSettings>(
    '/api/v1/settings/stashdb'
  );

  const schema = Yup.object().shape({
    endpoint: Yup.string()
      .required(intl.formatMessage(messages.validationEndpoint))
      .url(intl.formatMessage(messages.validationEndpoint)),
    apiKey: Yup.string().required(
      intl.formatMessage(messages.validationApiKey)
    ),
  });

  const testConnection = async (values: StashDbSettings) => {
    setIsTesting(true);
    try {
      const response = await axios.post<{ version: string }>(
        '/api/v1/settings/stashdb/test',
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
      <div className="mb-6 mt-10">
        <h3 className="heading">
          {intl.formatMessage(messages.stashdbSettings)}
        </h3>
        <p className="description">
          {intl.formatMessage(messages.stashdbSettingsDescription)}
        </p>
      </div>
      {!data && !error ? (
        <LoadingSpinner />
      ) : (
        <Formik
          initialValues={{
            endpoint: data?.endpoint ?? 'https://stashdb.org/graphql',
            apiKey: data?.apiKey ?? '',
          }}
          enableReinitialize
          validationSchema={schema}
          onSubmit={async (values) => {
            try {
              await axios.post('/api/v1/settings/stashdb', values);
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
                <label htmlFor="stashdbEndpoint" className="text-label">
                  {intl.formatMessage(messages.endpoint)}
                  <span className="label-required">*</span>
                </label>
                <div className="form-input-area">
                  <div className="form-input-field">
                    <Field
                      type="text"
                      inputMode="url"
                      id="stashdbEndpoint"
                      name="endpoint"
                    />
                  </div>
                  {errors.endpoint && touched.endpoint && (
                    <div className="error">{errors.endpoint}</div>
                  )}
                </div>
              </div>
              <div className="form-row">
                <label htmlFor="stashdbApiKey" className="text-label">
                  {intl.formatMessage(messages.apiKey)}
                  <span className="label-required">*</span>
                </label>
                <div className="form-input-area">
                  <div className="form-input-field">
                    <SensitiveInput
                      as="field"
                      id="stashdbApiKey"
                      name="apiKey"
                    />
                  </div>
                  {errors.apiKey && touched.apiKey && (
                    <div className="error">{errors.apiKey}</div>
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

export default SettingsStashDb;
