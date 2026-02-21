import { useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Menu,
  Home,
  Users,
  FileText,
  CreditCard,
  Package,
  Settings,
  LogOut,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

import { ThemeToggle } from './ThemeToggle';
import { signOut } from 'firebase/auth';
import { auth } from '@/Config/firebase';
import { toast } from 'sonner';

const navigation = [
  { name: 'Dashboard', href: '/', icon: Home },
  { name: 'Customers', href: '/customers', icon: Users },
  { name: 'Invoices', href: '/invoices', icon: FileText },
  { name: 'Items Catalog', href: '/items-catalog', icon: Package },
  { name: 'Payments', href: '/payments', icon: CreditCard },
  {
    name: 'Settings',
    href: '/settings',
    icon: Settings,
    children: [
      {
        name: 'Invoice Metadata',
        href: '/settings/invoice-metadata',
      },
    ],
  },
];

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/login');
    } catch (error) {
      console.error('Logout failed:', error);
      toast.error('Logout failed', {
        description: 'Please try again later.',
      });
    }
  };

  return (
    <div className="min-h-screen bg-background md:p-0">
      {/* Mobile sidebar */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden fixed top-4 right-4 z-50"
            onClick={() => setSidebarOpen((prev) => !prev)}
          >
            {sidebarOpen ? (
              <X className="h-6 w-6 transition-transform duration-200" />
            ) : (
              <Menu className="h-6 w-6 transition-transform duration-200" />
            )}
          </Button>
        </SheetTrigger>
        <SheetContent side="right" className="w-64 p-0">
          <SheetHeader>
            <SheetTitle className="text-lg font-semibold">
              Invoice Manager
            </SheetTitle>
            <SheetDescription>Manage your invoices and here.</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col h-full">
            <div className="p-6">
              <h2 className="text-lg font-semibold">Invoice Manager</h2>
            </div>
            <nav className="flex-1 px-4 space-y-2">
              {navigation.map((item) => {
                const Icon = item.icon;
                const isActive =
                  location.pathname === item.href ||
                  (item.children &&
                    item.children.some((c) => location.pathname === c.href));
                return (
                  <div key={item.name}>
                    <Link
                      to={item.href}
                      onClick={() => setSidebarOpen(false)}
                      className={`flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                      }`}
                    >
                      <Icon className="mr-3 h-4 w-4" />
                      {item.name}
                    </Link>
                    {item.children?.map((child) => {
                      const isChildActive = location.pathname === child.href;
                      return (
                        <Link
                          key={child.name}
                          to={child.href}
                          onClick={() => setSidebarOpen(false)}
                          className={`ml-8 mt-1 block rounded-md px-3 py-2 text-sm transition-colors ${
                            isChildActive
                              ? 'bg-primary/90 text-primary-foreground'
                              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                          }`}
                        >
                          {child.name}
                        </Link>
                      );
                    })}
                  </div>
                );
              })}
            </nav>
          </div>
          <SheetFooter>
            <div className="w-full max-w-sm ">
              <div className="flex items-center justify-between mb-2 border-b pb-2">
                <span className="text-sm text-zinc-700 dark:text-zinc-300">
                  Theme
                </span>
                <ThemeToggle />
              </div>
              {/* <div className="flex items-center justify-between py-2 border-t border-b mb-2">
                <div className="text-sm leading-tight">
                  <div className="truncate font-semibold text-zinc-900 dark:text-white">
                    John Doe
                  </div>
                  <div className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                    john@example.com
                  </div>
                </div>
              </div> */}
              <Button
                onClick={handleLogout}
                variant="outline"
                className="w-full"
              >
                <LogOut className="size-4 mr-2" />
                Log out
              </Button>{' '}
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Desktop sidebar */}
      <div className="hidden md:fixed md:inset-y-0 md:flex md:w-64 md:flex-col">
        <div className="flex flex-col flex-grow border-r bg-card">
          <div className="flex flex-col justify-center flex-shrink-0 px-6 py-4">
            <h2 className="text-lg font-semibold">Invoice Manager</h2>
            <p className="text-muted-foreground">
              Manage your invoices and payments here.
            </p>
          </div>
          <div className="flex-grow flex flex-col">
            <nav className="flex-1 px-4 space-y-2">
              {navigation.map((item) => {
                const Icon = item.icon;
                const isActive =
                  location.pathname === item.href ||
                  (item.children &&
                    item.children.some((c) => location.pathname === c.href));
                return (
                  <div key={item.name}>
                    <Link
                      to={item.href}
                      className={`flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                      }`}
                    >
                      <Icon className="mr-3 h-4 w-4" />
                      {item.name}
                    </Link>
                    {item.children?.map((child) => {
                      const isChildActive = location.pathname === child.href;
                      return (
                        <Link
                          key={child.name}
                          to={child.href}
                          className={`ml-8 mt-1 block rounded-md px-3 py-2 text-sm transition-colors ${
                            isChildActive
                              ? 'bg-primary/90 text-primary-foreground'
                              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                          }`}
                        >
                          {child.name}
                        </Link>
                      );
                    })}
                  </div>
                );
              })}
            </nav>
          </div>
          <div className="p-4">
            <div className="w-full max-w-sm ">
              <div className="flex items-center justify-between mb-2 border-b pb-2">
                <span className="text-sm text-zinc-700 dark:text-zinc-300">
                  Theme
                </span>
                <ThemeToggle />
              </div>

              {/* <div className="flex items-center justify-between py-2 border-t border-b mb-2">
                <div className="text-sm leading-tight">
                  <div className="truncate font-semibold text-zinc-900 dark:text-white">
                    John Doe
                  </div>
                  <div className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                    john@example.com
                  </div>
                </div>
              </div> */}

              <Button
                onClick={handleLogout}
                variant="outline"
                className="w-full"
              >
                <LogOut className="size-4 mr-2" />
                Log out
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="md:pl-64">
        <main className="">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
