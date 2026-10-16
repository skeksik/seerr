import Badge from '@app/components/Common/Badge';
import Button from '@app/components/Common/Button';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import SensitiveInput from '@app/components/Common/SensitiveInput';
import MetadataSelector, {
  MetadataProviderType,
} from '@app/components/MetadataSelector';
import { useSafeMode } from '@app/hooks/useAdult';
import useSettings from '@app/hooks/useSettings';
import useToasts from '@app/hooks/useToasts';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import { ArrowDownOnSquareIcon, BeakerIcon } from '@heroicons/react/24/outline';
import type { StashDbSettings, TpdbSettings } from '@server/lib/settings';
import axios from 'axios';
import { Field, Form, Formik } from 'formik';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';
import * as Yup from 'yup';

const messages = defineMessages('components.Settings', {
  metadataProviderSettings: 'Metadata Providers',
  general: 'General',
  settings: 'Settings',
  seriesMetadataProvider: 'Series metadata provider',
  animeMetadataProvider: 'Anime metadata provider',
  metadataSettings: 'Settings for metadata provider',
  clickTest:
    'Click on the "Test" button to check connectivity with metadata providers',
  notTested: 'Not Tested',
  failed: 'Does not work',
  operational: 'Operational',
  providerStatus: 'Metadata Provider Status',
  chooseProvider: 'Choose metadata providers for different content types',
  metadataProviderSelection: 'Metadata Provider Selection',
  tmdbProviderDoesnotWork:
    'TMDB provider does not work, please select another metadata provider',
  tvdbProviderDoesnotWork:
    'TVDB provider does not work, please select another metadata provider',
  allChosenProvidersAreOperational:
    'All chosen metadata providers are operational',
  connectionTestFailed: 'Connection test failed',
  failedToSaveMetadataSettings: 'Failed to save metadata provider settings',
  metadataSettingsSaved: 'Metadata provider settings saved',
  adultProviders: 'Adult Content',
  adultProvidersDescription: 'Metadata providers for scenes and adult movies',
  stashdbEndpoint: 'StashDB GraphQL Endpoint',
  stashdbApiKey: 'StashDB API Key',
  stashdbApiKeyTip: 'Found on your StashDB profile page',
  tpdbUrl: 'ThePornDB API URL',
  tpdbApiKey: 'ThePornDB API Key',
  tpdbApiKeyTip: 'Found on your ThePornDB profile page',
  validationUrl: 'You must provide a valid URL',
  providerDoesNotWork: '{provider} does not work, check its settings',
});

type ProviderStatus = 'ok' | 'not tested' | 'failed';

interface ProviderResponse {
  tvdb: ProviderStatus;
  tmdb: ProviderStatus;
}

interface AdultProviderStatus {
  stashdb: ProviderStatus;
  tpdb: ProviderStatus;
}

interface AdultValues {
  stashdb: StashDbSettings;
  tpdb: TpdbSettings;
}

interface MetadataValues {
  tv: MetadataProviderType;
  anime: MetadataProviderType;
}

interface MetadataSettings {
  metadata: MetadataValues;
}

const SettingsMetadata = () => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const [isTesting, setIsTesting] = useState(false);
  const defaultStatus: ProviderResponse = {
    tmdb: 'not tested',
    tvdb: 'not tested',
  };

  const [providerStatus, setProviderStatus] =
    useState<ProviderResponse>(defaultStatus);
  const [adultStatus, setAdultStatus] = useState<AdultProviderStatus>({
    stashdb: 'not tested',
    tpdb: 'not tested',
  });
  const { currentSettings } = useSettings();
  // Safe mode hides adult settings too
  const safeMode = useSafeMode();
  const adult = currentSettings.enableAdult && !safeMode;
  const { data: stashDbData, error: stashDbError } = useSWR<StashDbSettings>(
    adult ? '/api/v1/settings/stashdb' : null
  );
  const { data: tpdbData, error: tpdbError } = useSWR<TpdbSettings>(
    adult ? '/api/v1/settings/tpdb' : null
  );

  const { data, error } = useSWR<MetadataSettings>(
    '/api/v1/settings/metadatas',
    async (url: string) => {
      const response = await axios.get<{
        tv: MetadataProviderType;
        anime: MetadataProviderType;
      }>(url);

      return {
        metadata: {
          tv: response.data.tv,
          anime: response.data.anime,
        },
      };
    }
  );

  const testConnection = async (
    values: MetadataValues
  ): Promise<ProviderResponse> => {
    const useTmdb =
      values.tv === MetadataProviderType.TMDB ||
      values.anime === MetadataProviderType.TMDB;
    const useTvdb =
      values.tv === MetadataProviderType.TVDB ||
      values.anime === MetadataProviderType.TVDB;

    const testData = {
      tmdb: useTmdb,
      tvdb: useTvdb,
    };

    try {
      const response = await axios.post<{
        success: boolean;
        tests: ProviderResponse;
      }>('/api/v1/settings/metadatas/test', testData);

      const newStatus: ProviderResponse = {
        tmdb: useTmdb ? response.data.tests.tmdb : 'not tested',
        tvdb: useTvdb ? response.data.tests.tvdb : 'not tested',
      };

      setProviderStatus(newStatus);
      return newStatus;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        // If we receive an error response with a valid format
        const errorData = error.response.data as {
          success: boolean;
          tests: ProviderResponse;
        };

        if (errorData.tests) {
          const newStatus: ProviderResponse = {
            tmdb: useTmdb ? errorData.tests.tmdb : 'not tested',
            tvdb: useTvdb ? errorData.tests.tvdb : 'not tested',
          };

          setProviderStatus(newStatus);
          return newStatus;
        }
      }

      // In case of error without usable data
      throw new Error('Failed to test connection', { cause: error });
    }
  };

  const saveSettings = async (
    values: MetadataValues
  ): Promise<MetadataSettings> => {
    try {
      const response = await axios.put<{
        success: boolean;
        tv: MetadataProviderType;
        anime: MetadataProviderType;
        tests?: {
          tvdb: ProviderStatus;
          tmdb: ProviderStatus;
        };
      }>('/api/v1/settings/metadatas', {
        tv: values.tv,
        anime: values.anime,
      });

      // Update metadata provider status if available
      if (response.data.tests) {
        const mapStatusValue = (status: string): ProviderStatus => {
          if (status === 'ok') return 'ok';
          if (status === 'failed') return 'failed';
          return 'not tested';
        };

        setProviderStatus({
          tmdb: mapStatusValue(response.data.tests.tmdb),
          tvdb: mapStatusValue(response.data.tests.tvdb),
        });
      }

      // Adapt the response to the format expected by the component
      return {
        metadata: {
          tv: response.data.tv,
          anime: response.data.anime,
        },
      };
    } catch (error) {
      // Retrieve test data in case of error
      if (axios.isAxiosError(error) && error.response?.data) {
        const errorData = error.response.data as {
          success: boolean;
          tests?: {
            tvdb: string;
            tmdb: string;
          };
        };

        // If test data is available in the error response
        if (errorData.tests) {
          const mapStatusValue = (status: string): ProviderStatus => {
            if (status === 'ok') return 'ok';
            if (status === 'failed') return 'failed';
            return 'not tested';
          };

          // Update metadata provider status with error data
          setProviderStatus({
            tmdb: mapStatusValue(errorData.tests.tmdb),
            tvdb: mapStatusValue(errorData.tests.tvdb),
          });
        }
      }

      throw new Error('Failed to save Metadata settings', { cause: error });
    }
  };

  // Tests or saves an adult provider. Providers without a key are left
  // alone, so they can stay unconfigured.
  const postProvider = async (
    url: string,
    body: StashDbSettings | TpdbSettings
  ): Promise<ProviderStatus> => {
    if (!body.apiKey) {
      return 'not tested';
    }

    try {
      await axios.post(url, body);
      return 'ok';
    } catch {
      return 'failed';
    }
  };

  const testAdult = async (
    values: AdultValues
  ): Promise<AdultProviderStatus> => {
    const [stashdb, tpdb] = await Promise.all([
      postProvider('/api/v1/settings/stashdb/test', values.stashdb),
      postProvider('/api/v1/settings/tpdb/test', values.tpdb),
    ]);
    const status = { stashdb, tpdb };
    setAdultStatus(status);
    return status;
  };

  const saveAdult = async (values: AdultValues): Promise<void> => {
    const [stashdb, tpdb] = await Promise.all([
      postProvider('/api/v1/settings/stashdb', values.stashdb),
      postProvider('/api/v1/settings/tpdb', values.tpdb),
    ]);
    setAdultStatus({ stashdb, tpdb });

    if (stashdb === 'failed' || tpdb === 'failed') {
      throw new Error('Failed to save adult metadata settings');
    }
  };

  const getStatusClass = (status: ProviderStatus): string => {
    switch (status) {
      case 'ok':
        return 'text-green-500';
      case 'not tested':
        return 'text-yellow-500';
      case 'failed':
        return 'text-red-500';
    }
  };

  const getStatusMessage = (status: ProviderStatus): string => {
    switch (status) {
      case 'ok':
        return intl.formatMessage(messages.operational);
      case 'not tested':
        return intl.formatMessage(messages.notTested);
      case 'failed':
        return intl.formatMessage(messages.failed);
    }
  };

  const getBadgeType = (
    status: ProviderStatus
  ):
    | 'default'
    | 'primary'
    | 'danger'
    | 'warning'
    | 'success'
    | 'dark'
    | 'light'
    | undefined => {
    switch (status) {
      case 'ok':
        return 'success';
      case 'not tested':
        return 'warning';
      case 'failed':
        return 'danger';
    }
  };

  if (!data && !error) {
    return <LoadingSpinner />;
  }

  // Only the adult section waits for its settings
  const adultLoading =
    adult && ((!stashDbData && !stashDbError) || (!tpdbData && !tpdbError));

  const adultInitialValues: AdultValues = {
    stashdb: {
      endpoint: stashDbData?.endpoint ?? 'https://stashdb.org/graphql',
      apiKey: stashDbData?.apiKey ?? '',
    },
    tpdb: {
      url: tpdbData?.url ?? 'https://api.theporndb.net',
      apiKey: tpdbData?.apiKey ?? '',
    },
  };

  const schema = Yup.object().shape({
    adult: Yup.object().shape({
      stashdb: Yup.object().shape({
        endpoint: Yup.string().url(intl.formatMessage(messages.validationUrl)),
      }),
      tpdb: Yup.object().shape({
        url: Yup.string().url(intl.formatMessage(messages.validationUrl)),
      }),
    }),
  });

  const statusRow = (
    name: string,
    status: ProviderStatus,
    testId: string
  ): React.ReactNode => (
    <div className="flex items-center">
      <span className="mr-2 w-28">{name}:</span>
      <span
        className={`text-sm ${getStatusClass(status)}`}
        data-testid={testId}
      >
        <Badge badgeType={getBadgeType(status)}>
          {getStatusMessage(status)}
        </Badge>
      </span>
    </div>
  );

  const initialValues: MetadataValues = data?.metadata || {
    tv: MetadataProviderType.TMDB,
    anime: MetadataProviderType.TMDB,
  };

  return (
    <>
      <PageTitle
        title={[
          intl.formatMessage(messages.general),
          intl.formatMessage(globalMessages.settings),
        ]}
      />

      <div className="mb-6">
        <h3 className="heading">
          {intl.formatMessage(messages.metadataProviderSettings)}
        </h3>
        <p className="description">
          {intl.formatMessage(messages.metadataSettings)}
        </p>
      </div>

      <div className="mb-6 rounded-lg bg-gray-800 p-4">
        <h4 className="mb-3 text-lg font-medium">
          {intl.formatMessage(messages.providerStatus)}
        </h4>
        <div className="flex flex-col space-y-3">
          {statusRow(
            'TheMovieDB',
            providerStatus.tmdb,
            'tmdb-status-container'
          )}
          {statusRow('TheTVDB', providerStatus.tvdb, 'tvdb-status')}
          {adult && (
            <>
              {statusRow('StashDB', adultStatus.stashdb, 'stashdb-status')}
              {statusRow('ThePornDB', adultStatus.tpdb, 'tpdb-status')}
            </>
          )}
        </div>
      </div>

      <div className="section">
        <Formik
          initialValues={{ metadata: initialValues, adult: adultInitialValues }}
          // Takes in the adult settings once they have loaded
          enableReinitialize
          validationSchema={schema}
          onSubmit={async (values) => {
            try {
              const result = await saveSettings(values.metadata);

              if (adult) {
                await saveAdult(values.adult);
              }

              if (data) {
                data.metadata = result.metadata;
              }

              addToast(intl.formatMessage(messages.metadataSettingsSaved), {
                appearance: 'success',
                autoDismiss: true,
              });
            } catch {
              addToast(
                intl.formatMessage(messages.failedToSaveMetadataSettings),
                {
                  appearance: 'error',
                  autoDismiss: true,
                }
              );
            }
          }}
        >
          {({
            isSubmitting,
            isValid,
            values,
            setFieldValue,
            errors,
            touched,
          }) => {
            return (
              <Form className="section" data-testid="settings-main-form">
                <div className="mb-6">
                  <h2 className="heading">
                    {intl.formatMessage(messages.metadataProviderSelection)}
                  </h2>
                  <p className="description">
                    {intl.formatMessage(messages.chooseProvider)}
                  </p>
                </div>

                <div className="form-row">
                  <label
                    htmlFor="tv-metadata-provider"
                    className="checkbox-label"
                  >
                    <span className="mr-2">
                      {intl.formatMessage(messages.seriesMetadataProvider)}
                    </span>
                  </label>
                  <div className="form-input-area">
                    <MetadataSelector
                      testId="tv-metadata-provider-selector"
                      value={values.metadata.tv}
                      onChange={(value) => setFieldValue('metadata.tv', value)}
                      isDisabled={isSubmitting}
                    />
                  </div>
                </div>

                <div className="form-row">
                  <label
                    htmlFor="anime-metadata-provider"
                    className="checkbox-label"
                  >
                    <span className="mr-2">
                      {intl.formatMessage(messages.animeMetadataProvider)}
                    </span>
                  </label>
                  <div className="form-input-area">
                    <MetadataSelector
                      testId="anime-metadata-provider-selector"
                      value={values.metadata.anime}
                      onChange={(value) =>
                        setFieldValue('metadata.anime', value)
                      }
                      isDisabled={isSubmitting}
                    />
                  </div>
                </div>

                {adult && (
                  <>
                    <div className="mb-6 mt-10">
                      <h2 className="heading">
                        {intl.formatMessage(messages.adultProviders)}
                      </h2>
                      <p className="description">
                        {intl.formatMessage(messages.adultProvidersDescription)}
                      </p>
                    </div>
                    {adultLoading ? (
                      <LoadingSpinner />
                    ) : (
                      <>
                        <div className="form-row">
                          <label
                            htmlFor="stashdbEndpoint"
                            className="text-label"
                          >
                            {intl.formatMessage(messages.stashdbEndpoint)}
                          </label>
                          <div className="form-input-area">
                            <div className="form-input-field">
                              <Field
                                type="text"
                                inputMode="url"
                                id="stashdbEndpoint"
                                name="adult.stashdb.endpoint"
                              />
                            </div>
                            {errors.adult?.stashdb?.endpoint &&
                              touched.adult?.stashdb?.endpoint && (
                                <div className="error">
                                  {errors.adult.stashdb.endpoint}
                                </div>
                              )}
                          </div>
                        </div>
                        <div className="form-row">
                          <label htmlFor="stashdbApiKey" className="text-label">
                            {intl.formatMessage(messages.stashdbApiKey)}
                            <span className="label-tip">
                              {intl.formatMessage(messages.stashdbApiKeyTip)}
                            </span>
                          </label>
                          <div className="form-input-area">
                            <div className="form-input-field">
                              <SensitiveInput
                                as="field"
                                id="stashdbApiKey"
                                name="adult.stashdb.apiKey"
                              />
                            </div>
                          </div>
                        </div>
                        <div className="form-row">
                          <label htmlFor="tpdbUrl" className="text-label">
                            {intl.formatMessage(messages.tpdbUrl)}
                          </label>
                          <div className="form-input-area">
                            <div className="form-input-field">
                              <Field
                                type="text"
                                inputMode="url"
                                id="tpdbUrl"
                                name="adult.tpdb.url"
                              />
                            </div>
                            {errors.adult?.tpdb?.url &&
                              touched.adult?.tpdb?.url && (
                                <div className="error">
                                  {errors.adult.tpdb.url}
                                </div>
                              )}
                          </div>
                        </div>
                        <div className="form-row">
                          <label htmlFor="tpdbApiKey" className="text-label">
                            {intl.formatMessage(messages.tpdbApiKey)}
                            <span className="label-tip">
                              {intl.formatMessage(messages.tpdbApiKeyTip)}
                            </span>
                          </label>
                          <div className="form-input-area">
                            <div className="form-input-field">
                              <SensitiveInput
                                as="field"
                                id="tpdbApiKey"
                                name="adult.tpdb.apiKey"
                              />
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                  </>
                )}

                <div className="actions">
                  <div className="flex justify-end">
                    <span className="ml-3 inline-flex rounded-md shadow-sm">
                      <Button
                        buttonType="warning"
                        type="button"
                        disabled={isSubmitting || !isValid}
                        onClick={async () => {
                          setIsTesting(true);
                          try {
                            const [resp, adultResp] = await Promise.all([
                              testConnection(values.metadata),
                              adult ? testAdult(values.adult) : undefined,
                            ]);
                            const failedAdult =
                              adultResp?.stashdb === 'failed'
                                ? 'StashDB'
                                : adultResp?.tpdb === 'failed'
                                  ? 'ThePornDB'
                                  : undefined;

                            if (resp.tvdb === 'failed') {
                              addToast(
                                intl.formatMessage(
                                  messages.tvdbProviderDoesnotWork
                                ),
                                {
                                  appearance: 'error',
                                  autoDismiss: true,
                                }
                              );
                            } else if (resp.tmdb === 'failed') {
                              addToast(
                                intl.formatMessage(
                                  messages.tmdbProviderDoesnotWork
                                ),
                                {
                                  appearance: 'error',
                                  autoDismiss: true,
                                }
                              );
                            } else if (failedAdult) {
                              addToast(
                                intl.formatMessage(
                                  messages.providerDoesNotWork,
                                  { provider: failedAdult }
                                ),
                                {
                                  appearance: 'error',
                                  autoDismiss: true,
                                }
                              );
                            } else {
                              addToast(
                                intl.formatMessage(
                                  messages.allChosenProvidersAreOperational
                                ),
                                {
                                  appearance: 'success',
                                  autoDismiss: true,
                                }
                              );
                            }
                          } catch {
                            addToast(
                              intl.formatMessage(messages.connectionTestFailed),
                              {
                                appearance: 'error',
                                autoDismiss: true,
                              }
                            );
                          } finally {
                            setIsTesting(false);
                          }
                        }}
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
                        data-testid="metadata-save-button"
                        buttonType="primary"
                        type="submit"
                        disabled={isSubmitting || !isValid || isTesting}
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
              </Form>
            );
          }}
        </Formik>
      </div>
    </>
  );
};

export default SettingsMetadata;
