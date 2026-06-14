"use client";

import { useCallback, useEffect, useState } from "react";

import { defaultSummary, mockAlerts, mockResources } from "@/dashboard/mock-data";
import { enrichResourcesWithHealth } from "@/dashboard/health";
import {
  createNotificationChannel,
  deleteNotificationChannel,
  fetchInfraSightSnapshot,
  notificationChannelAction,
  runBackendAction,
  setActiveOrganization,
  WS_URL,
} from "@/services/infrasight-api";
import type {
  AlertDelivery,
  AlertRecord,
  ChannelForm,
  MetricSample,
  MonitoringSummary,
  NotificationChannel,
  Resource,
} from "@/types/infrasight";

/**
 * Loads and mutates all dashboard data for the selected workspace.
 *
 * Inputs:
 * - organizationId: current workspace/tenant ID used by API headers and WS params
 *
 * Outputs:
 * - workspace-scoped resources, alerts, metrics, notification settings and actions
 *
 * Important assumption:
 * - The API client must receive setActiveOrganization before every request so
 *   fast workspace switches do not leak reads or writes across workspaces.
 */
export function useInfraSightData(organizationId = "internal") {
  const [resources, setResources] = useState<Resource[]>(
    enrichResourcesWithHealth(mockResources, mockAlerts),
  );
  const [alerts, setAlerts] = useState<AlertRecord[]>(mockAlerts);
  const [metrics, setMetrics] = useState<MetricSample[]>([]);
  const [summary, setSummary] = useState<MonitoringSummary>(defaultSummary);
  const [channels, setChannels] = useState<NotificationChannel[]>([]);
  const [deliveries, setDeliveries] = useState<AlertDelivery[]>([]);
  const [busy, setBusy] = useState(false);
  const [realtime, setRealtime] = useState("connecting");
  const [lastEvent, setLastEvent] = useState("booting console");

  const loadAll = useCallback(async () => {
    setActiveOrganization(organizationId);
    const snapshot = await fetchInfraSightSnapshot();
    const nextResources = snapshot.resources.length ? snapshot.resources : mockResources;
    const nextAlerts = snapshot.alerts.length ? snapshot.alerts : mockAlerts;

    setResources(enrichResourcesWithHealth(nextResources, nextAlerts));
    setSummary(snapshot.summary);
    setAlerts(nextAlerts);
    setMetrics(snapshot.metrics);
    setChannels(snapshot.channels);
    setDeliveries(snapshot.deliveries);
  }, [organizationId]);

  useEffect(() => {
    let mounted = true;

    setActiveOrganization(organizationId);
    fetchInfraSightSnapshot()
      .then((snapshot) => {
        if (!mounted) return;
        const nextResources = snapshot.resources.length ? snapshot.resources : mockResources;
        const nextAlerts = snapshot.alerts.length ? snapshot.alerts : mockAlerts;
        setResources(enrichResourcesWithHealth(nextResources, nextAlerts));
        setSummary(snapshot.summary);
        setAlerts(nextAlerts);
        setMetrics(snapshot.metrics);
        setChannels(snapshot.channels);
        setDeliveries(snapshot.deliveries);
      })
      .catch(() => undefined);

    return () => {
      mounted = false;
    };
  }, [loadAll, organizationId]);

  useEffect(() => {
    const params = new URLSearchParams({ tenant: organizationId, organization: organizationId });
    const socket = new WebSocket(`${WS_URL}/ws/events?${params.toString()}`);

    socket.onopen = () => {
      setRealtime("connected");
      setLastEvent("event stream online");
    };

    socket.onmessage = (event) => {
      const message = JSON.parse(event.data) as { type: string };
      setLastEvent(message.type);
      loadAll().catch(() => undefined);
    };

    socket.onerror = () => {
      setRealtime("offline");
      setLastEvent("event stream unavailable");
    };

    socket.onclose = () => setRealtime("disconnected");

    return () => socket.close();
  }, [loadAll, organizationId]);

  const runAction = async (path: string) => {
    setBusy(true);
    try {
      setActiveOrganization(organizationId);
      await runBackendAction(path);
      await loadAll();
    } finally {
      setBusy(false);
    }
  };

  const addChannel = async (channel: ChannelForm) => {
    setActiveOrganization(organizationId);
    await createNotificationChannel(channel);
    await loadAll();
  };

  const channelAction = async (
    channel: NotificationChannel,
    action: "test" | "enable" | "disable" | "delete",
  ) => {
    setActiveOrganization(organizationId);
    let result: Awaited<ReturnType<typeof notificationChannelAction>> | undefined;
    if (action === "delete") {
      await deleteNotificationChannel(channel.id);
    } else {
      result = await notificationChannelAction(channel.id, action);
    }
    await loadAll();
    return result;
  };

  return {
    alerts,
    busy,
    channels,
    deliveries,
    lastEvent,
    loadAll,
    metrics,
    realtime,
    resources,
    runAction,
    addChannel,
    channelAction,
    summary,
  };
}
