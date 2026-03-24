import axios, { AxiosInstance, AxiosResponse } from "axios";
import {
  JiraIssue,
  TempoWorklogResponse,
  TempoWorklogCreatePayload,
  TempoClientConfig,
  IssueCache,
  TempoApiError,
  TempoScheduleResponse,
  GetScheduleParams
} from "./types/index.js";

export class TempoClient {
  private axiosInstance: AxiosInstance;
  private jiraAxiosInstance: AxiosInstance | null = null;
  private issueCache: IssueCache = {};
  private workerCache = new Map<string, { displayName: string; emailAddress: string }>();
  private config: TempoClientConfig;
  private currentUser: string | null = null;
  private isCloudMode: boolean;

  constructor(config: TempoClientConfig) {
    this.config = config;
    this.isCloudMode = !!config.jiraBaseUrl;

    // Main axios instance: Tempo API (cloud) or unified Jira+Tempo (legacy)
    this.axiosInstance = axios.create({
      baseURL: config.baseUrl,
      timeout: config.timeout || 30000,
      headers: {
        'Authorization': `Bearer ${config.personalAccessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'TempoFiller-MCP/1.0.0'
      }
    });

    // Cloud mode: separate Jira axios instance with Basic auth
    if (this.isCloudMode && config.jiraBaseUrl && config.jiraEmail && config.jiraApiToken) {
      const basicAuth = Buffer.from(`${config.jiraEmail}:${config.jiraApiToken}`).toString('base64');
      this.jiraAxiosInstance = axios.create({
        baseURL: config.jiraBaseUrl,
        timeout: config.timeout || 30000,
        headers: {
          'Authorization': `Basic ${basicAuth}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'TempoFiller-MCP/1.0.0'
        }
      });
    }

    // Add request interceptor for debugging
    this.axiosInstance.interceptors.request.use(
      (config) => {
        console.error(`DEBUG: Making ${config.method?.toUpperCase()} request to ${config.baseURL}${config.url}`);
        console.error(`DEBUG: Headers:`, JSON.stringify(config.headers, null, 2));
        if (config.data) {
          console.error(`DEBUG: Request body:`, JSON.stringify(config.data, null, 2));
        }
        return config;
      },
      (error) => {
        console.error(`DEBUG: Request error:`, error);
        return Promise.reject(error);
      }
    );

    // Add response interceptor for error handling
    this.axiosInstance.interceptors.response.use(
      (response) => {
        console.error(`DEBUG: Response ${response.status} from ${response.config.url}`);
        return response;
      },
      (error) => {
        console.error(`DEBUG: Response error ${error.response?.status} from ${error.config?.url}`);
        console.error(`DEBUG: Error response:`, error.response?.data);

        if (error.response?.status === 401) {
          throw new Error('Authentication failed. Please check your Personal Access Token.');
        }
        if (error.response?.status === 403) {
          throw new Error('Access forbidden. Please check your permissions in JIRA/Tempo.');
        }
        if (error.response?.status === 429) {
          throw new Error('Rate limit exceeded. Please try again later.');
        }

        const apiError: TempoApiError = error.response?.data;
        if (apiError?.message) {
          throw new Error(`Tempo API Error: ${apiError.message}`);
        }

        throw error;
      }
    );
  }

  /**
   * Get the current authenticated user.
   * Cloud mode: calls Jira /rest/api/3/myself and returns accountId.
   * Legacy mode: calls /rest/api/latest/myself and returns key.
   */
  private async getCurrentUser(): Promise<string> {
    if (this.currentUser) {
      return this.currentUser;
    }

    try {
      if (this.isCloudMode && this.jiraAxiosInstance) {
        const response = await this.jiraAxiosInstance.get('/rest/api/3/myself');
        this.currentUser = response.data.accountId;
        console.error(`🔐 AUTHENTICATED USER (Cloud): ${this.currentUser}`);
      } else {
        const response = await this.axiosInstance.get('/rest/api/latest/myself');
        this.currentUser = response.data.key;
        console.error(`🔐 AUTHENTICATED USER: ${this.currentUser}`);
      }

      if (!this.currentUser) {
        throw new Error('Unable to determine current user from API response');
      }

      return this.currentUser;
    } catch (error) {
      throw new Error(`Failed to get current user: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get JIRA issue details by issue key.
   * Cloud mode: uses Jira Cloud REST API v3.
   * Legacy mode: uses Jira REST API latest.
   */
  async getIssueById(issueKey: string): Promise<JiraIssue> {
    // Check cache first
    const cached = this.issueCache[issueKey];
    if (cached && (Date.now() - cached.cached.getTime()) < 300000) {
      return {
        id: cached.id,
        key: cached.key,
        fields: {
          summary: cached.summary,
          project: cached.projectKey ? { key: cached.projectKey, name: '' } : undefined
        }
      };
    }

    try {
      const instance = this.isCloudMode && this.jiraAxiosInstance ? this.jiraAxiosInstance : this.axiosInstance;
      const path = this.isCloudMode ? `/rest/api/3/issue/${issueKey}` : `/rest/api/latest/issue/${issueKey}`;
      const response: AxiosResponse<JiraIssue> = await instance.get(path);

      const issue = response.data;

      // Cache the result — index by both the lookup param and the canonical key
      const cacheEntry = {
        id: issue.id,
        key: issue.key,
        summary: issue.fields.summary,
        projectKey: issue.fields.project?.key || '',
        cached: new Date()
      };
      this.issueCache[issueKey] = cacheEntry;
      if (issue.key !== issueKey) {
        this.issueCache[issue.key] = cacheEntry;
      }

      return issue;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        throw new Error(`Issue ${issueKey} not found. Please check the issue key.`);
      }
      throw error;
    }
  }

  /**
   * Resolve worker display name and email address, with caching.
   */
  private async resolveWorkerInfo(workerId: string): Promise<{ displayName: string; emailAddress: string }> {
    if (!workerId) return { displayName: '', emailAddress: '' };
    const cached = this.workerCache.get(workerId);
    if (cached) return cached;
    try {
      let info: { displayName: string; emailAddress: string };
      if (this.isCloudMode && this.jiraAxiosInstance) {
        const response = await this.jiraAxiosInstance.get('/rest/api/3/user', { params: { accountId: workerId } });
        info = {
          displayName: response.data?.displayName || '',
          emailAddress: response.data?.emailAddress || ''
        };
      } else {
        const response = await this.axiosInstance.get('/rest/api/latest/user', { params: { key: workerId } });
        info = {
          displayName: response.data?.displayName || '',
          emailAddress: response.data?.emailAddress || ''
        };
      }
      this.workerCache.set(workerId, info);
      return info;
    } catch {
      const info = { displayName: '', emailAddress: '' };
      this.workerCache.set(workerId, info);
      return info;
    }
  }

  /**
   * Get worklogs for a user and optional date range / issue filter.
   * Cloud mode: uses Jira Cloud API for issue-specific worklogs; Tempo Cloud API for date-based.
   * Legacy mode: uses Jira API for issue-specific; Tempo search for date-based.
   */
  async getWorklogs(params: {
    from?: string;
    to?: string;
    issueKey?: string;
    worker?: string;
    allUsers?: boolean;
    maxResults?: number;
    projectKey?: string;
  }): Promise<TempoWorklogResponse[]> {
    // targetUser: null = no user filter (all users); string = filter to that specific user
    const targetUser = params.allUsers ? null : (params.worker ?? await this.getCurrentUser());

    console.error(`🔍 WORKLOG SEARCH: Processing request for params:`, JSON.stringify(params));
    console.error(`👤 USER: ${targetUser === null ? 'all users' : targetUser}`);

    try {
      if (params.issueKey) {
        console.error(`📋 ISSUE-SPECIFIC: Getting worklogs for issue ${params.issueKey}`);

        const issue = await this.getIssueById(params.issueKey);
        console.error(`✅ ISSUE RESOLVED: ${issue.key} - ${issue.fields.summary}`);

        const instance = this.isCloudMode && this.jiraAxiosInstance ? this.jiraAxiosInstance : this.axiosInstance;
        const path = this.isCloudMode
          ? `/rest/api/3/issue/${params.issueKey}/worklog`
          : `/rest/api/latest/issue/${params.issueKey}/worklog`;

        const response = await instance.get(path);

        console.error(`📊 JIRA RESPONSE: Found ${response.data?.worklogs?.length || 0} worklogs`);

        const jiraWorklogs = response.data?.worklogs || [];

        const filteredWorklogs = targetUser === null
          ? jiraWorklogs
          : jiraWorklogs.filter((worklog: any) =>
              worklog.author?.name === targetUser ||
              worklog.author?.accountId === targetUser ||
              worklog.author?.emailAddress === targetUser
            );

        // Batch-resolve worker identity for all unique authors
        const uniqueWorkerIds = [...new Set(filteredWorklogs.map((w: any) => w.author?.accountId || w.author?.name || '').filter(Boolean))] as string[];
        const workerInfoMap = new Map<string, { displayName: string; emailAddress: string }>();
        await Promise.all(uniqueWorkerIds.map(async (id) => {
          workerInfoMap.set(id, await this.resolveWorkerInfo(id));
        }));

        const convertedWorklogs = filteredWorklogs.map((worklog: any) => {
          const workerId = worklog.author?.accountId || worklog.author?.name || '';
          const workerInfo = workerInfoMap.get(workerId) || { displayName: worklog.author?.displayName || '', emailAddress: '' };
          return {
            id: worklog.id,
            timeSpentSeconds: worklog.timeSpentSeconds,
            billableSeconds: worklog.timeSpentSeconds,
            timeSpent: worklog.timeSpent,
            issue: {
              id: issue.id,
              key: params.issueKey!,
              summary: issue.fields.summary
            },
            started: worklog.started,
            worker: workerId,
            workerDisplayName: workerInfo.displayName,
            workerEmail: workerInfo.emailAddress,
            attributes: {}
          };
        });

        console.error(`🎯 CONVERTED: Returning ${convertedWorklogs.length} worklogs`);
        return convertedWorklogs as TempoWorklogResponse[];
      }

      console.error(`📅 DATE-BASED: Attempting Tempo search for date range`);

      if (this.isCloudMode) {
        // Tempo Cloud API v4: GET /4/worklogs — omit accountId for all-users queries
        const queryParams: any = {
          from: params.from || new Date().toISOString().slice(0, 7) + '-01',
          to: params.to || new Date().toISOString().slice(0, 10)
        };
        if (targetUser !== null) queryParams.accountId = targetUser;

        console.error(`🔍 TEMPO CLOUD SEARCH: Sending GET /4/worklogs with:`, JSON.stringify(queryParams));

        // Paginate: Tempo Cloud defaults to 50/page; fetch all pages up to 1000 each
        let rawResults: any[] = [];
        let offset = 0;
        const pageLimit = 1000;
        while (true) {
          const response = await this.axiosInstance.get('/4/worklogs', {
            params: { ...queryParams, limit: pageLimit, offset }
          });
          const page: any[] = response.data?.results || [];
          rawResults = rawResults.concat(page);
          const meta = response.data?.metadata;
          const reachedMax = params.maxResults && rawResults.length >= params.maxResults;
          if (!meta || rawResults.length >= meta.count || page.length < pageLimit || reachedMax) break;
          offset += pageLimit;
        }
        if (params.maxResults) rawResults = rawResults.slice(0, params.maxResults);
        console.error(`📊 TEMPO CLOUD RESPONSE: Received ${rawResults.length} results`);

        // Batch-resolve issue key + summary + projectKey for unique issue IDs (cloud worklogs only have numeric id)
        const uniqueIssueIds = [...new Set(rawResults.map((w: any) => String(w.issue?.id)).filter(Boolean))];
        const issueDetails = new Map<string, { key: string; summary: string; projectKey: string }>();
        await Promise.all(uniqueIssueIds.map(async (issueId) => {
          try {
            const issue = await this.getIssueById(issueId);
            issueDetails.set(issueId, {
              key: issue.key,
              summary: issue.fields.summary,
              projectKey: issue.fields.project?.key || ''
            });
          } catch {
            issueDetails.set(issueId, { key: issueId, summary: '', projectKey: '' });
          }
        }));

        // Apply project filter after issue resolution (cloud API has no server-side projectKey filter)
        if (params.projectKey) {
          const filterKey = params.projectKey.toUpperCase();
          rawResults = rawResults.filter((w: any) => {
            const detail = issueDetails.get(String(w.issue?.id));
            return (detail?.projectKey || '').toUpperCase() === filterKey;
          });
        }

        // Batch-resolve worker identity for all unique authors
        const uniqueWorkerIds = [...new Set(rawResults.map((w: any) => w.author?.accountId || '').filter(Boolean))] as string[];
        const workerInfoMap = new Map<string, { displayName: string; emailAddress: string }>();
        await Promise.all(uniqueWorkerIds.map(async (id) => {
          workerInfoMap.set(id, await this.resolveWorkerInfo(id));
        }));

        // Normalize cloud shape to match TempoWorklogResponse expected by the tools
        return rawResults.map((w: any) => {
          const detail = issueDetails.get(String(w.issue?.id));
          const workerId = w.author?.accountId || '';
          const workerInfo = workerInfoMap.get(workerId) || { displayName: '', emailAddress: '' };
          return {
            id: w.tempoWorklogId?.toString(),
            tempoWorklogId: w.tempoWorklogId,
            billableSeconds: w.billableSeconds,
            timeSpentSeconds: w.timeSpentSeconds,
            timeSpent: `${Math.round(w.timeSpentSeconds / 3600 * 100) / 100}h`,
            comment: w.description,
            started: w.startDate,  // cloud uses startDate; tools expect started
            issue: {
              id: w.issue?.id,
              key: detail?.key || String(w.issue?.id || ''),
              summary: detail?.summary || '',
              internalIssue: false,
              issueStatus: '',
              reporterKey: '',
              estimatedRemainingSeconds: 0,
              components: [],
              issueType: '',
              projectId: 0,
              projectKey: '',
              iconUrl: '',
              versions: [],
            },
            worker: workerId,
            workerDisplayName: workerInfo.displayName,
            workerEmail: workerInfo.emailAddress,
            updater: '',
            originId: 0,
            originTaskId: w.issue?.id || 0,
            dateCreated: w.createdAt || '',
            dateUpdated: w.updatedAt || '',
            attributes: {},
          } as TempoWorklogResponse;
        });
      } else {
        // Legacy: POST /rest/tempo-timesheets/4/worklogs/search
        const searchParams: any = {
          from: params.from || new Date().toISOString().slice(0, 7) + '-01',
          to: params.to || new Date().toISOString().slice(0, 10),
        };
        if (targetUser !== null) searchParams.worker = [targetUser];
        if (params.projectKey) searchParams.projectKey = params.projectKey;

        console.error(`🔍 TEMPO SEARCH: Sending request with:`, JSON.stringify(searchParams));

        const response = await this.axiosInstance.post(
          `/rest/tempo-timesheets/4/worklogs/search`,
          searchParams
        );

        console.error(`📊 TEMPO RESPONSE: Received ${Array.isArray(response.data) ? response.data.length : 'non-array'} results`);

        let legacyResults: TempoWorklogResponse[] = Array.isArray(response.data) ? response.data : [];
        if (params.maxResults) legacyResults = legacyResults.slice(0, params.maxResults);

        // Batch-resolve worker identity for legacy results
        const uniqueWorkerIds = [...new Set(legacyResults.map((w: any) => w.worker || '').filter(Boolean))] as string[];
        const workerInfoMap = new Map<string, { displayName: string; emailAddress: string }>();
        await Promise.all(uniqueWorkerIds.map(async (id) => {
          workerInfoMap.set(id, await this.resolveWorkerInfo(id));
        }));
        legacyResults.forEach((w: any) => {
          const info = workerInfoMap.get(w.worker || '') || { displayName: '', emailAddress: '' };
          w.workerDisplayName = info.displayName;
          w.workerEmail = info.emailAddress;
        });

        return legacyResults;
      }
    } catch (error) {
      console.error(`❌ ERROR in getWorklogs:`, error);
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const url = error.config?.url;
        const method = error.config?.method?.toUpperCase();
        const responseData = error.response?.data;
        throw new Error(`Failed to retrieve worklogs: ${method} ${url} returned ${status}. ${responseData?.message || JSON.stringify(responseData)}`);
      }
      throw new Error(`Failed to retrieve worklogs: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get work schedule for the authenticated user.
   * Cloud mode: uses Tempo Cloud API v4 GET /4/user-schedule.
   * Legacy mode: uses POST /rest/tempo-core/2/user/schedule/search.
   */
  async getSchedule(params: GetScheduleParams & { worker?: string }): Promise<TempoScheduleResponse[]> {
    const targetUser = params.worker ?? await this.getCurrentUser();

    console.error(`📅 SCHEDULE SEARCH: Processing request for params:`, JSON.stringify(params));
    console.error(`👤 USER: ${targetUser}`);

    try {
      const { startDate, endDate } = params;
      const actualEndDate = endDate || startDate;

      if (this.isCloudMode) {
        // Tempo Cloud API v4: GET /4/user-schedule?accountId=...&from=...&to=...
        const queryParams = {
          accountId: targetUser,
          from: startDate,
          to: actualEndDate
        };

        console.error(`🔍 TEMPO CLOUD SCHEDULE: Sending GET /4/user-schedule with:`, JSON.stringify(queryParams));

        const response = await this.axiosInstance.get('/4/user-schedule', { params: queryParams });

        const rawDays: any[] = response.data?.results || [];
        console.error(`📊 TEMPO CLOUD SCHEDULE RESPONSE: Received ${rawDays.length} results`);

        // Normalize flat cloud day list → TempoScheduleResponse shape expected by tools
        const totalRequiredSeconds = rawDays.reduce((s: number, d: any) => s + (d.requiredSeconds || 0), 0);
        return [{
          schedule: {
            numberOfWorkingDays: rawDays.filter((d: any) => d.type === 'WORKING_DAY').length,
            requiredSeconds: totalRequiredSeconds,
            days: rawDays.map((d: any) => ({
              date: d.date,
              requiredSeconds: d.requiredSeconds || 0,
              type: d.type as 'WORKING_DAY' | 'NON_WORKING_DAY'
            }))
          },
          user: { username: targetUser, displayName: '', key: targetUser }
        }];
      } else {
        // Legacy: POST /rest/tempo-core/2/user/schedule/search
        const searchParams = {
          from: startDate,
          to: actualEndDate,
          userKeys: [targetUser]
        };

        console.error(`🔍 TEMPO SCHEDULE SEARCH: Sending request with:`, JSON.stringify(searchParams));

        const response = await this.axiosInstance.post(
          `/rest/tempo-core/2/user/schedule/search`,
          searchParams
        );

        console.error(`📊 TEMPO SCHEDULE RESPONSE: Received ${Array.isArray(response.data) ? response.data.length : 'non-array'} results`);

        return Array.isArray(response.data) ? response.data : [];
      }
    } catch (error) {
      console.error(`❌ ERROR in getSchedule:`, error);
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const url = error.config?.url;
        const method = error.config?.method?.toUpperCase();
        const responseData = error.response?.data;
        throw new Error(`Failed to retrieve schedule: ${method} ${url} returned ${status}. ${responseData?.message || JSON.stringify(responseData)}`);
      }
      throw new Error(`Failed to retrieve schedule: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Create a new worklog entry.
   * Cloud mode: POST /4/worklogs with Tempo Cloud payload format.
   * Legacy mode: POST /rest/tempo-timesheets/4/worklogs/ with legacy payload format.
   */
  async createWorklog(payload: TempoWorklogCreatePayload): Promise<TempoWorklogResponse> {
    try {
      if (this.isCloudMode) {
        // Tempo Cloud API v4 payload format
        const cloudPayload = {
          issueId: parseInt(payload.originTaskId, 10),
          timeSpentSeconds: payload.timeSpentSeconds,
          billableSeconds: payload.billableSeconds,
          startDate: payload.started.split('T')[0],
          startTime: '00:00:00',
          authorAccountId: payload.worker,
          description: payload.comment,
          attributes: []
        };

        const response: AxiosResponse<TempoWorklogResponse> = await this.axiosInstance.post(
          '/4/worklogs',
          cloudPayload
        );

        // Enrich response with issue key/summary from cache (cloud response only contains issue.id)
        const data = response.data as any;
        if (data.issue) {
          const issueId = String(data.issue.id);
          const cached = this.issueCache[issueId] || this.issueCache[payload.originTaskId];
          if (cached) {
            data.issue = { ...data.issue, key: cached.key, summary: cached.summary };
          }
        }
        return data;
      } else {
        // Legacy: returns an array with a single worklog
        const response: AxiosResponse<TempoWorklogResponse[]> = await this.axiosInstance.post(
          '/rest/tempo-timesheets/4/worklogs/',
          payload
        );

        const worklogs = response.data;
        if (!Array.isArray(worklogs) || worklogs.length === 0) {
          throw new Error('Unexpected response format from Tempo API');
        }

        return worklogs[0];
      }
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.data) {
        const apiError: TempoApiError = error.response.data;
        throw new Error(`Failed to create worklog: ${apiError.message || error.message}`);
      }
      throw new Error(`Failed to create worklog: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Delete a worklog entry.
   */
  async deleteWorklog(worklogId: string): Promise<void> {
    try {
      const path = this.isCloudMode
        ? `/4/worklogs/${worklogId}`
        : `/rest/tempo-timesheets/4/worklogs/${worklogId}`;
      await this.axiosInstance.delete(path);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        throw new Error(`Worklog ${worklogId} not found.`);
      }
      throw new Error(`Failed to delete worklog: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  hoursToSeconds(hours: number): number {
    return Math.round(hours * 3600);
  }

  secondsToHours(seconds: number): number {
    return Math.round((seconds / 3600) * 100) / 100;
  }

  /**
   * Create worklog payload from simplified parameters.
   * Automatically uses the authenticated user as the worker.
   */
  async createWorklogPayload(params: {
    issueKey: string;
    hours: number;
    startDate: string;
    endDate?: string;
    billable?: boolean;
    description?: string;
    worker?: string;
  }): Promise<TempoWorklogCreatePayload> {
    const issue = await this.getIssueById(params.issueKey);
    const resolvedWorker = params.worker ?? await this.getCurrentUser();

    const timeInSeconds = this.hoursToSeconds(params.hours);
    const startDate = params.startDate;
    const endDate = params.endDate || params.startDate;

    const payload: TempoWorklogCreatePayload = {
      attributes: {},
      billableSeconds: params.billable !== false ? timeInSeconds : 0,
      timeSpentSeconds: timeInSeconds,
      worker: resolvedWorker,
      started: `${startDate}T00:00:00.000`,
      originTaskId: issue.id,
      remainingEstimate: null,
      endDate: `${endDate}T00:00:00.000`,
      comment: params.description || undefined
    };

    return payload;
  }

  /**
   * Batch create multiple worklogs concurrently.
   */
  async createWorklogsBatch(worklogParams: Array<{
    issueKey: string;
    hours: number;
    startDate: string;
    endDate?: string;
    billable?: boolean;
    description?: string;
    worker?: string;
  }>): Promise<Array<{
    success: boolean;
    worklog?: TempoWorklogResponse;
    error?: string;
    originalParams: typeof worklogParams[0];
  }>> {
    const payloadPromises = worklogParams.map(async (params) => ({
      params,
      payload: await this.createWorklogPayload(params)
    }));

    const payloadResults = await Promise.all(payloadPromises);

    const createPromises = payloadResults.map(async ({ params, payload }) => {
      try {
        const worklog = await this.createWorklog(payload);
        return {
          success: true,
          worklog,
          originalParams: params
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          originalParams: params
        };
      }
    });

    return Promise.all(createPromises);
  }

  clearIssueCache(): void {
    this.issueCache = {};
  }

  getCachedIssueCount(): number {
    return Object.keys(this.issueCache).length;
  }
}
