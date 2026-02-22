import { Link, Outlet, useLocation } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function SettingsPage() {
  const location = useLocation();
  const isInvoiceMetadata = location.pathname.includes('/invoice-metadata');
  const isReconciliation = location.pathname.includes('/reconciliation');

  return (
    <div className="h-screen flex flex-col gap-6 py-6 md:py-8">
      <div className="px-6 md:px-8">
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Configure system-level settings.</p>
      </div>

      <div className="flex-1 overflow-y-auto px-6 md:px-8 grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">Settings Menu</CardTitle>
          </CardHeader>
          <CardContent>
            <Link
              to="/settings/invoice-metadata"
              className={`block rounded-md px-3 py-2 text-sm ${
                isInvoiceMetadata
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              Invoice Metadata
            </Link>
            <Link
              to="/settings/reconciliation"
              className={`mt-1 block rounded-md px-3 py-2 text-sm ${
                isReconciliation
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              Reconciliation
            </Link>
          </CardContent>
        </Card>

        <div>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
