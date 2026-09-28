import { useState } from "react";

export function createOperationalDataViewActions(options, transitions) {
  async function loadData() {
    transitions.setLoading(true);
    transitions.setErrorText("");

    try {
      const data = await options.loadList();
      transitions.setRecords(Array.isArray(data.items) ? data.items : []);
    } catch (error) {
      transitions.setErrorText(error.message || options.listErrorMessage);
    } finally {
      transitions.setLoading(false);
    }
  }

  async function loadSelectedDetail(id) {
    transitions.setDetailLoading(true);
    transitions.setErrorText("");
    transitions.setSuccessText("");

    try {
      const detail = await options.loadDetail(id);
      transitions.setSelectedDetail(detail);
      if (options.onDetailLoaded) {
        options.onDetailLoaded(detail);
      }
    } catch (error) {
      transitions.setErrorText(error.message || options.detailErrorMessage);
    } finally {
      transitions.setDetailLoading(false);
    }
  }

  return {
    loadData,
    loadSelectedDetail,
  };
}

export function useOperationalDataView(options) {
  const [filters, setFilters] = useState(options.initialFilters);
  const [records, setRecords] = useState([]);
  const [selectedDetail, setSelectedDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [successText, setSuccessText] = useState("");

  const actions = createOperationalDataViewActions(
    {
      loadList: () => options.loadList(filters),
      loadDetail: options.loadDetail,
      listErrorMessage: options.listErrorMessage,
      detailErrorMessage: options.detailErrorMessage,
      onDetailLoaded: options.onDetailLoaded,
    },
    {
      setRecords,
      setSelectedDetail,
      setLoading,
      setDetailLoading,
      setErrorText,
      setSuccessText,
    }
  );

  return {
    filters,
    setFilters,
    records,
    selectedDetail,
    loading,
    detailLoading,
    errorText,
    setErrorText,
    successText,
    setSuccessText,
    loadData: actions.loadData,
    loadSelectedDetail: actions.loadSelectedDetail,
  };
}
