import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { Badge, statusToTone, Button, Card, CardBody } from "../components/ui";
import { Table, Thead, Tbody, Tr, Th, Td } from "../components/ui/Table";
import { LoadingOverlay } from "../components/ui/Spinner";
import type { AgentRun } from "../lib/types";

export default function CaseHistory() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [runs, setRuns] = useState<AgentRun[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<AgentRun[]>("/api/ingest/runs")
      .then(setRuns)
      .catch((err) => setError(err instanceof ApiError ? err.message : String(err)));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-100">{t("history.title")}</h1>
        <p className="mt-1 text-sm text-slate-400">{t("history.subtitle")}</p>
      </div>

      <Card>
        <CardBody>
          {error && <div className="text-sm text-rose-400">{error}</div>}
          {!runs && !error && <LoadingOverlay label={t("common.loading")} />}
          {runs && runs.length === 0 && (
            <div className="py-8 text-center text-sm text-slate-500">{t("history.empty")}</div>
          )}
          {runs && runs.length > 0 && (
            <Table>
              <Thead>
                <Tr>
                  <Th>{t("history.runId")}</Th>
                  <Th>{t("history.summary")}</Th>
                  <Th>{t("history.started")}</Th>
                  <Th>{t("history.status")}</Th>
                  <Th>{t("history.claim")}</Th>
                  <Th>{t("history.alert")}</Th>
                  <Th>{" "}</Th>
                </Tr>
              </Thead>
              <Tbody>
                {runs.map((r) => (
                  <Tr key={r.run_id}>
                    <Td className="font-mono text-xs">{r.run_id}</Td>
                    <Td className="max-w-xs truncate">{r.case_summary}</Td>
                    <Td className="text-xs text-slate-400">{new Date(r.started_at).toLocaleString()}</Td>
                    <Td>
                      <Badge tone={statusToTone(r.status)}>{r.status}</Badge>
                    </Td>
                    <Td className="text-xs">{r.claim_id ?? "—"}</Td>
                    <Td className="text-xs">{r.alert_id ?? "—"}</Td>
                    <Td>
                      <Button size="sm" variant="secondary" onClick={() => navigate(`/cases/${r.run_id}`)}>
                        {t("history.view")}
                      </Button>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
