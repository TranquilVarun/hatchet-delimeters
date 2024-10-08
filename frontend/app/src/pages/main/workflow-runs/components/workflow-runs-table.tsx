import { DataTable } from '@/components/molecules/data-table/data-table.tsx';
import { columns } from './workflow-runs-columns';
import { useEffect, useMemo, useState } from 'react';
import {
  ColumnFiltersState,
  PaginationState,
  RowSelectionState,
  SortingState,
  VisibilityState,
} from '@tanstack/react-table';
import { useMutation, useQuery } from '@tanstack/react-query';
import invariant from 'tiny-invariant';
import api, {
  ReplayWorkflowRunsRequest,
  WorkflowRunOrderByDirection,
  WorkflowRunOrderByField,
  WorkflowRunStatus,
  queries,
} from '@/lib/api';
import { Loading } from '@/components/ui/loading.tsx';
import { TenantContextType } from '@/lib/outlet';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import {
  FilterOption,
  ToolbarFilters,
  ToolbarType,
} from '@/components/molecules/data-table/data-table-toolbar';
import { Button } from '@/components/ui/button';
import {
  ArrowPathIcon,
  ArrowPathRoundedSquareIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { WorkflowRunsMetricsView } from './workflow-runs-metrics';
import queryClient from '@/query-client';
import { useApiError } from '@/lib/hooks';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAtom } from 'jotai';
import { lastTimeRangeAtom } from '@/lib/atoms';
import { Skeleton } from '@/components/ui/skeleton';

export interface WorkflowRunsTableProps {
  createdAfter?: string;
  createdBefore?: string;
  workflowId?: string;
  parentWorkflowRunId?: string;
  parentStepRunId?: string;
  initColumnVisibility?: VisibilityState;
  filterVisibility?: { [key: string]: boolean };
  refetchInterval?: number;
}

export function WorkflowRunsTable({
  workflowId,
  initColumnVisibility = {},
  filterVisibility = {},
  parentWorkflowRunId,
  parentStepRunId,
  refetchInterval = 5000,
}: WorkflowRunsTableProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const { tenant } = useOutletContext<TenantContextType>();
  invariant(tenant);

  const [timeRange, setTimeRange] = useAtom(lastTimeRangeAtom);
  const [createdAfter, setCreatedAfter] = useState<string | undefined>(
    new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  );

  const [sorting, setSorting] = useState<SortingState>(() => {
    const sortParam = searchParams.get('sort');
    if (sortParam) {
      return sortParam.split(',').map((param) => {
        const [id, desc] = param.split(':');
        return { id, desc: desc === 'desc' };
      });
    }
    return [];
  });

  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(() => {
    const filtersParam = searchParams.get('filters');
    if (filtersParam) {
      return JSON.parse(filtersParam);
    }
    return [];
  });

  const [columnVisibility, setColumnVisibility] =
    useState<VisibilityState>(initColumnVisibility);

  const [pagination, setPagination] = useState<PaginationState>(() => {
    const pageIndex = Number(searchParams.get('pageIndex')) || 0;
    const pageSize = Number(searchParams.get('pageSize')) || 50;
    return { pageIndex, pageSize };
  });

  useEffect(() => {
    const newSearchParams = new URLSearchParams(searchParams);
    if (sorting.length) {
      newSearchParams.set(
        'orderDirection',
        sorting.map((s) => `${s.id}:${s.desc ? 'desc' : 'asc'}`).join(','),
      );
    } else {
      newSearchParams.delete('orderDirection');
    }
    if (columnFilters.length) {
      newSearchParams.set('filters', JSON.stringify(columnFilters));
    } else {
      newSearchParams.delete('filters');
    }
    newSearchParams.set('pageIndex', pagination.pageIndex.toString());
    newSearchParams.set('pageSize', pagination.pageSize.toString());

    if (newSearchParams.toString() !== searchParams.toString()) {
      setSearchParams(newSearchParams, { replace: true });
    }
  }, [sorting, columnFilters, pagination, setSearchParams, searchParams]);

  const [pageSize, setPageSize] = useState<number>(50);

  const offset = useMemo(() => {
    if (!pagination) {
      return;
    }

    return pagination.pageIndex * pagination.pageSize;
  }, [pagination]);

  const workflow = useMemo<string | undefined>(() => {
    if (workflowId) {
      return workflowId;
    }

    const filter = columnFilters.find((filter) => filter.id === 'Workflow');

    if (!filter) {
      return;
    }

    const vals = filter?.value as Array<string>;
    return vals[0];
  }, [columnFilters, workflowId]);

  const statuses = useMemo(() => {
    const filter = columnFilters.find((filter) => filter.id === 'status');

    if (!filter) {
      return;
    }

    return filter?.value as Array<WorkflowRunStatus>;
  }, [columnFilters]);

  const AdditionalMetadataFilter = useMemo(() => {
    const filter = columnFilters.find((filter) => filter.id === 'Metadata');

    if (!filter) {
      return;
    }

    return filter?.value as Array<string>;
  }, [columnFilters]);

  const orderByDirection = useMemo(():
    | WorkflowRunOrderByDirection
    | undefined => {
    if (!sorting.length) {
      return;
    }

    return sorting[0]?.desc
      ? WorkflowRunOrderByDirection.DESC
      : WorkflowRunOrderByDirection.ASC;
  }, [sorting]);

  const orderByField = useMemo((): WorkflowRunOrderByField | undefined => {
    if (!sorting.length) {
      return;
    }

    switch (sorting[0]?.id) {
      case 'Duration':
        return WorkflowRunOrderByField.Duration;
      case 'Finished at':
        return WorkflowRunOrderByField.FinishedAt;
      case 'Started at':
        return WorkflowRunOrderByField.StartedAt;
      case 'Seen at':
      default:
        return WorkflowRunOrderByField.CreatedAt;
    }
  }, [sorting]);

  const listWorkflowRunsQuery = useQuery({
    ...queries.workflowRuns.list(tenant.metadata.id, {
      offset,
      limit: pageSize,
      statuses,
      workflowId: workflow,
      parentWorkflowRunId,
      parentStepRunId,
      orderByDirection,
      orderByField,
      additionalMetadata: AdditionalMetadataFilter,
      createdAfter,
    }),
    refetchInterval,
  });

  const metricsQuery = useQuery({
    ...queries.workflowRuns.metrics(tenant.metadata.id, {
      workflowId: workflow,
      parentWorkflowRunId,
      parentStepRunId,
      additionalMetadata: AdditionalMetadataFilter,
      createdAfter,
    }),
    refetchInterval,
  });

  const {
    data: workflowKeys,
    isLoading: workflowKeysIsLoading,
    error: workflowKeysError,
  } = useQuery({
    ...queries.workflows.list(tenant.metadata.id),
  });

  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const selectedRuns = useMemo(() => {
    return Object.entries(rowSelection)
      .filter(([, selected]) => !!selected)
      .map(([id]) => (listWorkflowRunsQuery.data?.rows || [])[Number(id)]);
  }, [listWorkflowRunsQuery.data?.rows, rowSelection]);

  const { handleApiError } = useApiError({});

  const cancelWorkflowRunMutation = useMutation({
    mutationKey: ['workflow-run:cancel', tenant.metadata.id, selectedRuns],
    mutationFn: async () => {
      const tenantId = tenant.metadata.id;
      const workflowRunIds = selectedRuns.map((wr) => wr.metadata.id);

      invariant(tenantId, 'has tenantId');
      invariant(workflowRunIds, 'has runIds');

      const res = await api.workflowRunCancel(tenantId, {
        workflowRunIds,
      });

      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queries.workflowRuns.list(tenant.metadata.id, {}).queryKey,
      });
    },
    onError: handleApiError,
  });

  const replayWorkflowRunsMutation = useMutation({
    mutationKey: ['workflow-run:update:replay', tenant.metadata.id],
    mutationFn: async (data: ReplayWorkflowRunsRequest) => {
      await api.workflowRunUpdateReplay(tenant.metadata.id, data);
    },
    onSuccess: () => {
      setRowSelection({});

      // bit hacky, but workflow run statuses aren't updated immediately after replay
      setTimeout(() => {
        listWorkflowRunsQuery.refetch();
      }, 1000);
    },
    onError: handleApiError,
  });

  const workflowKeyFilters = useMemo((): FilterOption[] => {
    return (
      workflowKeys?.rows?.map((key) => ({
        value: key.metadata.id,
        label: key.name,
      })) || []
    );
  }, [workflowKeys]);

  const workflowRunStatusFilters = useMemo((): FilterOption[] => {
    return [
      {
        value: WorkflowRunStatus.SUCCEEDED,
        label: 'Succeeded',
      },
      {
        value: WorkflowRunStatus.FAILED,
        label: 'Failed',
      },
      {
        value: WorkflowRunStatus.RUNNING,
        label: 'Running',
      },
      {
        value: WorkflowRunStatus.QUEUED,
        label: 'Queued',
      },
      {
        value: WorkflowRunStatus.PENDING,
        label: 'Pending',
      },
    ];
  }, []);

  const filters: ToolbarFilters = [
    {
      columnId: 'Workflow',
      title: 'Workflow',
      options: workflowKeyFilters,
      type: ToolbarType.Radio,
    },
    {
      columnId: 'status',
      title: 'Status',
      options: workflowRunStatusFilters,
    },
    {
      columnId: 'Metadata',
      title: 'Metadata',
      type: ToolbarType.KeyValue,
    },
  ].filter((filter) => filterVisibility[filter.columnId] != false);

  const [rotate, setRotate] = useState(false);

  const refetch = () => {
    listWorkflowRunsQuery.refetch();
    metricsQuery.refetch();
  };

  const actions = [
    <Button
      disabled={!Object.values(rowSelection).some((selected) => !!selected)}
      key="cancel"
      className="h-8 px-2 lg:px-3"
      size="sm"
      onClick={() => {
        cancelWorkflowRunMutation.mutate();
      }}
      variant={'outline'}
      aria-label="Cancel Selected Runs"
    >
      <XMarkIcon className={`mr-2 h-4 w-4 transition-transform`} />
      Cancel
    </Button>,
    <Button
      disabled={!Object.values(rowSelection).some((selected) => !!selected)}
      key="replay"
      className="h-8 px-2 lg:px-3"
      size="sm"
      onClick={() => {
        replayWorkflowRunsMutation.mutate({
          workflowRunIds: selectedRuns.map((run) => run.metadata.id),
        });
      }}
      variant={'outline'}
      aria-label="Replay Selected Runs"
    >
      <ArrowPathRoundedSquareIcon className="mr-2 h-4 w-4 transition-transform" />
      Replay
    </Button>,
    <Button
      key="refresh"
      className="h-8 px-2 lg:px-3"
      size="sm"
      onClick={() => {
        refetch();
        setRotate(!rotate);
      }}
      variant={'outline'}
      aria-label="Refresh events list"
    >
      <ArrowPathIcon
        className={`h-4 w-4 transition-transform ${rotate ? 'rotate-180' : ''}`}
      />
    </Button>,
  ];

  if (listWorkflowRunsQuery.isLoading) {
    return <Loading />;
  }

  return (
    <>
      <div className="flex flex-row justify-between items-center my-4">
        {metricsQuery.data ? (
          <WorkflowRunsMetricsView
            metrics={metricsQuery.data}
            onClick={(status) => {
              setColumnFilters((prev) => {
                const statusFilter = prev.find(
                  (filter) => filter.id === 'status',
                );
                if (statusFilter) {
                  prev = prev.filter((filter) => filter.id !== 'status');
                }

                if (
                  JSON.stringify(statusFilter?.value) ===
                  JSON.stringify([status])
                ) {
                  return prev;
                }

                return [
                  ...prev,
                  {
                    id: 'status',
                    value: [status],
                  },
                ];
              });
            }}
          />
        ) : (
          <Skeleton className="max-w-[800px] w-[40vw] h-8" />
        )}
        <Select
          value={timeRange}
          onValueChange={(value) => {
            setTimeRange(value);

            switch (value) {
              case '1h':
                setCreatedAfter(
                  new Date(Date.now() - 60 * 60 * 1000).toISOString(),
                );
                break;
              case '6h':
                setCreatedAfter(
                  new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
                );
                break;
              case '1d':
                setCreatedAfter(
                  new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
                );
                break;
              case '7d':
                setCreatedAfter(
                  new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
                );
                break;
            }
          }}
        >
          <SelectTrigger className="w-fit">
            <SelectValue id="timerange" placeholder="Choose time range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1h">1 hour</SelectItem>
            <SelectItem value="6h">6 hours</SelectItem>
            <SelectItem value="1d">1 day</SelectItem>
            <SelectItem value="7d">7 days</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <DataTable
        emptyState={<>No workflow runs found with the given filters.</>}
        error={workflowKeysError}
        isLoading={workflowKeysIsLoading}
        columns={columns}
        columnVisibility={columnVisibility}
        setColumnVisibility={setColumnVisibility}
        data={listWorkflowRunsQuery.data?.rows || []}
        filters={filters}
        actions={actions}
        sorting={sorting}
        setSorting={setSorting}
        columnFilters={columnFilters}
        setColumnFilters={setColumnFilters}
        pagination={pagination}
        setPagination={setPagination}
        onSetPageSize={setPageSize}
        rowSelection={rowSelection}
        setRowSelection={setRowSelection}
        pageCount={listWorkflowRunsQuery.data?.pagination?.num_pages || 0}
        showColumnToggle={true}
      />
    </>
  );
}
