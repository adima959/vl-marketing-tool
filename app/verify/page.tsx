'use client';

import { useState } from 'react';
import { Button, Card, Spin, Alert } from 'antd';

interface QueryResult {
  postgres?: any[];
  mariadb?: any[];
  matched?: any[];
}

export default function VerifyPage() {
  const [results, setResults] = useState<QueryResult>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runVerification() {
    setLoading(true);
    setError(null);

    try {
      // Fetch from both databases via API
      const [postgresRes, mariadbRes] = await Promise.all([
        fetch('/api/verify/postgres', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date: '2026-01-28',
            campaignName: 'Balansera_Dnk_IM_24_11'
          })
        }),
        fetch('/api/verify/mariadb', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date: '2026-01-28',
            campaignId: '23291867037'
          })
        })
      ]);

      if (!postgresRes.ok) {
        const errorData = await postgresRes.json();
        throw new Error(`PostgreSQL query failed: ${errorData.error}`);
      }

      if (!mariadbRes.ok) {
        const errorData = await mariadbRes.json();
        throw new Error(`MariaDB query failed: ${errorData.error}`);
      }

      const postgresData = await postgresRes.json();
      const mariadbData = await mariadbRes.json();

      // Match data (client-side)
      const matched = matchData(postgresData.data, mariadbData.data);

      setResults({
        postgres: postgresData.data,
        mariadb: mariadbData.data,
        matched
      });
    } catch (error) {
      console.error('Verification failed:', error);
      setError(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  function matchSource(network: string, source: string): boolean {
    const networkLower = network.toLowerCase();
    const sourceLower = source.toLowerCase();

    if (networkLower === 'google ads') {
      return sourceLower === 'adwords' || sourceLower === 'google';
    }

    if (networkLower === 'facebook') {
      return sourceLower === 'facebook' || sourceLower === 'meta';
    }

    return false;
  }

  function matchData(adsData: any[], crmData: any[]) {
    if (!adsData || !crmData) return [];

    const matchedData = adsData.map(ad => {
      // Find ALL CRM rows that match this ad
      const matches = crmData.filter(crm =>
        ad.date === crm.date &&
        ad.campaign_id === crm.campaign_id &&
        ad.adset_id === crm.adset_id &&
        ad.ad_id === crm.ad_id &&
        matchSource(ad.network, crm.source)
      );

      // Filter to Balansera product only
      const balanseraMatches = matches.filter(crm =>
        crm.product_name && crm.product_name.includes('Balansera')
      );

      // Aggregate CRM metrics
      const crm_subscriptions = balanseraMatches.reduce(
        (sum, crm) => sum + (crm.subscription_count || 0), 0
      );
      const approved_sales = balanseraMatches.reduce(
        (sum, crm) => sum + (crm.approved_count || 0), 0
      );

      return {
        ...ad,
        crm_subscriptions,
        approved_sales,
        products: balanseraMatches.map(m => ({
          name: m.product_name,
          subs: m.subscription_count
        }))
      };
    });

    // Aggregate to campaign level
    const campaignTotal = {
      campaign_name: matchedData[0]?.campaign_name || 'N/A',
      total_cost: matchedData.reduce((sum, row) => sum + (Number(row.cost) || 0), 0),
      total_clicks: matchedData.reduce((sum, row) => sum + (Number(row.clicks) || 0), 0),
      total_impressions: matchedData.reduce((sum, row) => sum + (Number(row.impressions) || 0), 0),
      crm_subscriptions: matchedData.reduce((sum, row) => sum + (Number(row.crm_subscriptions) || 0), 0),
      approved_sales: matchedData.reduce((sum, row) => sum + (Number(row.approved_sales) || 0), 0)
    };

    return [campaignTotal];
  }

  return (
    <div className="p-8 min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">
          Two-Database Verification
        </h1>
        <p className="text-gray-600 mb-6">
          Phase 1: Verify two-database approach for Balansera campaign on Jan 28, 2026
        </p>

        <Card className="mb-6">
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold mb-2">Expected Results:</h3>
              <ul className="list-disc list-inside text-sm space-y-1">
                <li><strong>Current (Broken):</strong> 18 CRM subscriptions (includes Brainy product)</li>
                <li><strong>Expected (Fixed):</strong> 14 CRM subscriptions (Balansera only)</li>
                <li><strong>Campaign ID:</strong> 23291867037</li>
                <li><strong>Date:</strong> 2026-01-28</li>
              </ul>
            </div>

            <Button
              type="primary"
              size="large"
              onClick={runVerification}
              loading={loading}
              className="w-full sm:w-auto"
            >
              {loading ? 'Running Verification...' : 'Run Verification'}
            </Button>

            {error && (
              <Alert
                type="error"
                message="Verification Failed"
                description={error}
                closable
                onClose={() => setError(null)}
              />
            )}
          </div>
        </Card>

        {loading && (
          <div className="flex justify-center items-center py-12">
            <Spin size="large" />
          </div>
        )}

        {!loading && results.postgres && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card title="PostgreSQL (Ads Data)" className="overflow-auto">
              <div className="text-xs">
                <p className="mb-2 font-semibold">
                  Count: {results.postgres?.length || 0} rows
                </p>
                <pre className="bg-gray-100 p-4 rounded overflow-auto max-h-96 text-xs">
                  {JSON.stringify(results.postgres, null, 2)}
                </pre>
              </div>
            </Card>

            <Card title="MariaDB (CRM Data)" className="overflow-auto">
              <div className="text-xs">
                <p className="mb-2 font-semibold">
                  Count: {results.mariadb?.length || 0} rows
                </p>
                <pre className="bg-gray-100 p-4 rounded overflow-auto max-h-96 text-xs">
                  {JSON.stringify(results.mariadb, null, 2)}
                </pre>
              </div>
            </Card>

            <Card title="Matched Result (Fixed)" className="overflow-auto">
              <div className="text-xs">
                {results.matched && results.matched[0] && (
                  <div className="space-y-2 mb-4">
                    <div className="p-3 bg-green-50 border border-green-200 rounded">
                      <p className="font-bold text-lg text-green-800">
                        CRM Subscriptions: {results.matched[0].crm_subscriptions}
                      </p>
                      <p className="text-sm text-green-700">
                        {results.matched[0].crm_subscriptions === 14
                          ? '✅ CORRECT - Balansera only (14)'
                          : '❌ UNEXPECTED - Should be 14'}
                      </p>
                    </div>
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded">
                      <p className="font-semibold text-blue-800">Approved Sales: {results.matched[0].approved_sales}</p>
                      <p className="font-semibold text-blue-800">Cost: ${Number(results.matched[0].total_cost || 0).toFixed(2)}</p>
                      <p className="font-semibold text-blue-800">Clicks: {results.matched[0].total_clicks}</p>
                    </div>
                  </div>
                )}
                <pre className="bg-gray-100 p-4 rounded overflow-auto max-h-96 text-xs">
                  {JSON.stringify(results.matched, null, 2)}
                </pre>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
