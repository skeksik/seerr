import Button from '@app/components/Common/Button';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import SensitiveInput from '@app/components/Common/SensitiveInput';
import useToasts from '@app/hooks/useToasts';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import {
  ArrowDownOnSquareIcon,
  ArrowDownTrayIcon,
  BeakerIcon,
} from '@heroicons/react/24/outline';
import type { TmdbCompanySearchResponse } from '@server/api/themoviedb/interfaces';
import type { ProductionCompany } from '@server/models/common';
import axios from 'axios';
import { Field, Formik } from 'formik';
import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import AsyncSelect from 'react-select/async';
import useSWR from 'swr';

const messages = defineMessages('components.Settings.SettingsXxxMovies', {
  xxxMovies: 'XXX Movies',
  xxxMoviesDescription:
    'Choose where XXX movies are listed from. Requests for them are sent to Whisparr.',
  source: 'Source',
  sourceTpdb: 'ThePornDB',
  sourceTmdb: 'The Movie Database (TMDB)',
  tpdbApiKey: 'ThePornDB API Key',
  tpdbApiKeyTip: 'Create one under your profile on theporndb.net',
  tmdbStudios: 'TMDB Studios',
  tmdbStudiosTip:
    "TMDB cannot list adult movies on its own, so movies are listed from these studios' production companies",
  searchStudios: 'Search studios…',
  importWhisparr: 'Import from Whisparr',
  importedStudios:
    '{count, plural, =0 {No new studios found} one {Added # studio} other {Added # studios}} from Whisparr.',
  importFailed: 'Could not load studios from Whisparr.',
  validationApiKey: 'ThePornDB needs an API key',
  validationStudios: 'Add at least one studio',
  toastTestSuccess: 'Connected to ThePornDB!',
  toastTestFailure: 'Failed to connect to ThePornDB.',
  toastSaveSuccess: 'XXX movie settings saved successfully!',
  toastSaveFailure: 'Something went wrong while saving XXX movie settings.',
});

interface XxxMovieSettingsResponse {
  source: 'tpdb' | 'tmdb';
  tmdbCompanies: number[];
  tpdbApiKey: string;
}

type CompanyOption = { label: string; value: number };

const loadCompanyOptions = async (
  inputValue: string
): Promise<CompanyOption[]> => {
  if (!inputValue) {
    return [];
  }

  const { data } = await axios.get<TmdbCompanySearchResponse>(
    `/api/v1/search/company?query=${encodeURIComponent(inputValue)}`
  );

  return data.results.map((result) => ({
    label: result.name,
    value: result.id,
  }));
};

const SettingsXxxMovies = () => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const [isTesting, setIsTesting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [companies, setCompanies] = useState<CompanyOption[] | null>(null);
  const { data, error, mutate } = useSWR<XxxMovieSettingsResponse>(
    '/api/v1/settings/xxxmovies'
  );

  // Settings only store ids, so look the names up for display
  useEffect(() => {
    if (!data) {
      return;
    }

    let cancelled = false;
    Promise.all(
      data.tmdbCompanies.map(async (id) => {
        try {
          const { data: company } = await axios.get<ProductionCompany>(
            `/api/v1/studio/${id}`
          );
          return { label: company.name, value: id };
        } catch {
          return { label: String(id), value: id };
        }
      })
    ).then((options) => {
      if (!cancelled) {
        setCompanies(options);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [data]);

  const testConnection = async (apiKey: string) => {
    setIsTesting(true);
    try {
      await axios.post('/api/v1/settings/xxxmovies/test', { apiKey });
      addToast(intl.formatMessage(messages.toastTestSuccess), {
        autoDismiss: true,
        appearance: 'success',
      });
    } catch {
      addToast(intl.formatMessage(messages.toastTestFailure), {
        autoDismiss: true,
        appearance: 'error',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const importFromWhisparr = async (
    current: CompanyOption[],
    setValue: (value: CompanyOption[]) => void
  ) => {
    setIsImporting(true);
    try {
      const { data: found } = await axios.get<{ id: number; name: string }[]>(
        '/api/v1/settings/xxxmovies/whisparr-companies'
      );
      const added = found
        .filter((company) => !current.some((c) => c.value === company.id))
        .map((company) => ({ label: company.name, value: company.id }));
      setValue([...current, ...added]);
      addToast(
        intl.formatMessage(messages.importedStudios, { count: added.length }),
        { autoDismiss: true, appearance: 'info' }
      );
    } catch {
      addToast(intl.formatMessage(messages.importFailed), {
        autoDismiss: true,
        appearance: 'error',
      });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <>
      <div className="mb-6 mt-10">
        <h3 className="heading">{intl.formatMessage(messages.xxxMovies)}</h3>
        <p className="description">
          {intl.formatMessage(messages.xxxMoviesDescription)}
        </p>
      </div>
      {(!data && !error) || (data && !companies) ? (
        <LoadingSpinner />
      ) : (
        <Formik
          initialValues={{
            source: data?.source ?? 'tpdb',
            tpdbApiKey: data?.tpdbApiKey ?? '',
            companies: companies ?? [],
          }}
          enableReinitialize
          validate={(values) => {
            const errors: Record<string, string> = {};
            if (values.source === 'tpdb' && !values.tpdbApiKey) {
              errors.tpdbApiKey = intl.formatMessage(messages.validationApiKey);
            }
            if (values.source === 'tmdb' && values.companies.length === 0) {
              errors.companies = intl.formatMessage(messages.validationStudios);
            }
            return errors;
          }}
          onSubmit={async (values) => {
            try {
              await axios.post('/api/v1/settings/xxxmovies', {
                source: values.source,
                tpdbApiKey: values.tpdbApiKey,
                tmdbCompanies: values.companies.map((c) => c.value),
              });
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
            values,
            handleSubmit,
            setFieldValue,
            isSubmitting,
            isValid,
          }) => (
            <form className="section" onSubmit={handleSubmit}>
              <div className="form-row">
                <label htmlFor="xxxMovieSource" className="text-label">
                  {intl.formatMessage(messages.source)}
                </label>
                <div className="form-input-area">
                  <div className="form-input-field">
                    <Field as="select" id="xxxMovieSource" name="source">
                      <option value="tpdb">
                        {intl.formatMessage(messages.sourceTpdb)}
                      </option>
                      <option value="tmdb">
                        {intl.formatMessage(messages.sourceTmdb)}
                      </option>
                    </Field>
                  </div>
                </div>
              </div>
              <div className="form-row">
                <label htmlFor="tpdbApiKey" className="text-label">
                  {intl.formatMessage(messages.tpdbApiKey)}
                  {values.source === 'tpdb' && (
                    <span className="label-required">*</span>
                  )}
                  <span className="label-tip">
                    {intl.formatMessage(messages.tpdbApiKeyTip)}
                  </span>
                </label>
                <div className="form-input-area">
                  <div className="form-input-field">
                    <SensitiveInput
                      as="field"
                      id="tpdbApiKey"
                      name="tpdbApiKey"
                    />
                  </div>
                  {errors.tpdbApiKey && (
                    <div className="error">{errors.tpdbApiKey}</div>
                  )}
                </div>
              </div>
              {values.source === 'tmdb' && (
                <div className="form-row">
                  <label htmlFor="tmdbStudios" className="text-label">
                    {intl.formatMessage(messages.tmdbStudios)}
                    <span className="label-required">*</span>
                    <span className="label-tip">
                      {intl.formatMessage(messages.tmdbStudiosTip)}
                    </span>
                  </label>
                  <div className="form-input-area">
                    <div className="form-input-field">
                      <AsyncSelect<CompanyOption, true>
                        inputId="tmdbStudios"
                        className="react-select-container"
                        classNamePrefix="react-select"
                        isMulti
                        cacheOptions
                        loadOptions={loadCompanyOptions}
                        value={values.companies}
                        placeholder={intl.formatMessage(messages.searchStudios)}
                        onChange={(selected) =>
                          setFieldValue('companies', [...selected])
                        }
                      />
                    </div>
                    <div className="mt-2">
                      <Button
                        buttonType="ghost"
                        buttonSize="sm"
                        type="button"
                        disabled={isImporting}
                        onClick={() =>
                          importFromWhisparr(values.companies, (value) =>
                            setFieldValue('companies', value)
                          )
                        }
                      >
                        <ArrowDownTrayIcon />
                        <span>
                          {intl.formatMessage(messages.importWhisparr)}
                        </span>
                      </Button>
                    </div>
                    {errors.companies &&
                      typeof errors.companies === 'string' && (
                        <div className="error">{errors.companies}</div>
                      )}
                  </div>
                </div>
              )}
              <div className="actions">
                <div className="flex justify-end">
                  <span className="ml-3 inline-flex rounded-md shadow-sm">
                    <Button
                      buttonType="warning"
                      type="button"
                      disabled={isSubmitting || isTesting || !values.tpdbApiKey}
                      onClick={() => testConnection(values.tpdbApiKey)}
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

export default SettingsXxxMovies;
