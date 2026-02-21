import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { BankAccountDetails } from '@/Config/types';
import {
  getInvoiceMetadataSettings,
  saveInvoiceMetadataSettings,
} from '@/Config/firestore';
import { uploadInvoiceLogo } from '@/Config/storage';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export default function InvoiceMetadataPage() {
  const createBankAccount = (seed?: Partial<BankAccountDetails>): BankAccountDetails => ({
    id: seed?.id || `bank-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    label: seed?.label || '',
    bankName: seed?.bankName || '',
    branch: seed?.branch || '',
    swiftCode: seed?.swiftCode || '',
    bankAddress: seed?.bankAddress || '',
    accountName: seed?.accountName || '',
    accountType: seed?.accountType || '',
    accountNumber: seed?.accountNumber || '',
  });

  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [loading, setLoading] = useState(true);
  const logoFileInputRef = useRef<HTMLInputElement | null>(null);
  const [formData, setFormData] = useState({
    companyName: '',
    companyAddress: '',
    phone: '',
    fax: '',
    logoUrl: '',
    bankAccounts: [createBankAccount()],
    bankNotes: '',
    signatoryName: '',
    signatoryTitle: '',
    footerNotes: '',
  });

  useEffect(() => {
    const load = async () => {
      try {
        const data = await getInvoiceMetadataSettings();
        if (!data) return;
        setFormData({
          companyName: data.companyName || '',
          companyAddress: data.companyAddress || '',
          phone: data.phone || '',
          fax: data.fax || '',
          logoUrl: data.logoUrl || '',
          bankAccounts:
            data.bankAccounts && data.bankAccounts.length > 0
              ? data.bankAccounts.map((account) => createBankAccount(account))
              : [
                  createBankAccount({
                    label: 'Primary',
                    bankName: data.bankName || '',
                    branch: data.branch || '',
                    swiftCode: data.swiftCode || '',
                    bankAddress: data.bankAddress || '',
                    accountName: data.accountName || '',
                    accountType: data.accountType || '',
                    accountNumber: data.accountNumber || '',
                  }),
                ],
          bankNotes: data.bankNotes || '',
          signatoryName: data.signatoryName || '',
          signatoryTitle: data.signatoryTitle || '',
          footerNotes: data.footerNotes || '',
        });
      } catch (error) {
        console.error('Error loading metadata settings:', error);
        toast.error('Error', {
          description: 'Failed to load invoice metadata settings',
        });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.companyName.trim() || !formData.companyAddress.trim()) {
      toast.error('Error', {
        description: 'Company name and company address are required',
      });
      return;
    }
    try {
      setIsSaving(true);
      const cleanedBankAccounts = formData.bankAccounts
        .map((account) => ({
          id: account.id,
          label: account.label?.trim() || '',
          bankName: account.bankName?.trim() || '',
          branch: account.branch?.trim() || '',
          swiftCode: account.swiftCode?.trim() || '',
          bankAddress: account.bankAddress?.trim() || '',
          accountName: account.accountName?.trim() || '',
          accountType: account.accountType?.trim() || '',
          accountNumber: account.accountNumber?.trim() || '',
        }))
        .filter((account) =>
          [
            account.label,
            account.bankName,
            account.branch,
            account.swiftCode,
            account.bankAddress,
            account.accountName,
            account.accountType,
            account.accountNumber,
          ].some((value) => value)
        );

      const primaryBank = cleanedBankAccounts[0];
      await saveInvoiceMetadataSettings({
        companyName: formData.companyName.trim(),
        companyAddress: formData.companyAddress.trim(),
        phone: formData.phone.trim(),
        fax: formData.fax.trim(),
        logoUrl: formData.logoUrl.trim(),
        bankAccounts: cleanedBankAccounts,
        bankName: primaryBank?.bankName || '',
        branch: primaryBank?.branch || '',
        swiftCode: primaryBank?.swiftCode || '',
        bankAddress: primaryBank?.bankAddress || '',
        accountName: primaryBank?.accountName || '',
        accountType: primaryBank?.accountType || '',
        accountNumber: primaryBank?.accountNumber || '',
        bankNotes: formData.bankNotes.trim(),
        signatoryName: formData.signatoryName.trim(),
        signatoryTitle: formData.signatoryTitle.trim(),
        footerNotes: formData.footerNotes.trim(),
      });
      toast.success('Success', {
        description: 'Invoice metadata settings saved',
      });
    } catch (error) {
      console.error('Error saving metadata settings:', error);
      toast.error('Error', {
        description: 'Failed to save invoice metadata settings',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const updateBankAccount = (
    id: string,
    patch: Partial<BankAccountDetails>
  ) => {
    setFormData((prev) => ({
      ...prev,
      bankAccounts: prev.bankAccounts.map((account) =>
        account.id === id ? { ...account, ...patch } : account
      ),
    }));
  };

  const addBankAccount = () => {
    setFormData((prev) => ({
      ...prev,
      bankAccounts: [...prev.bankAccounts, createBankAccount()],
    }));
  };

  const removeBankAccount = (id: string) => {
    setFormData((prev) => ({
      ...prev,
      bankAccounts:
        prev.bankAccounts.length <= 1
          ? prev.bankAccounts
          : prev.bankAccounts.filter((account) => account.id !== id),
    }));
  };

  const handleLogoFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    const isImage = selectedFile.type.startsWith('image/');
    if (!isImage) {
      toast.error('Error', {
        description: 'Please select an image file',
      });
      event.target.value = '';
      return;
    }

    const maxSizeBytes = 5 * 1024 * 1024;
    if (selectedFile.size > maxSizeBytes) {
      toast.error('Error', {
        description: 'Logo size should be 5MB or less',
      });
      event.target.value = '';
      return;
    }

    try {
      setIsUploadingLogo(true);
      const downloadUrl = await uploadInvoiceLogo(selectedFile);
      setFormData((prev) => ({ ...prev, logoUrl: downloadUrl }));
      toast.success('Success', {
        description: 'Logo uploaded successfully',
      });
    } catch (error) {
      console.error('Error uploading logo:', error);
      toast.error('Error', {
        description: 'Failed to upload logo',
      });
    } finally {
      setIsUploadingLogo(false);
      event.target.value = '';
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invoice Metadata</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-muted-foreground">Loading settings...</p>
        ) : (
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="companyName">Company Name *</Label>
                <Input
                  id="companyName"
                  value={formData.companyName}
                  onChange={(e) =>
                    setFormData({ ...formData, companyName: e.target.value })
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="logoUrl">Logo URL</Label>
                <div className="flex gap-2">
                  <Input
                    id="logoUrl"
                    value={formData.logoUrl}
                    onChange={(e) =>
                      setFormData({ ...formData, logoUrl: e.target.value })
                    }
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => logoFileInputRef.current?.click()}
                    isLoading={isUploadingLogo}
                  >
                    Upload
                  </Button>
                </div>
                <input
                  ref={logoFileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleLogoFileChange}
                />
                {formData.logoUrl ? (
                  <img
                    src={formData.logoUrl}
                    alt="Company logo preview"
                    className="h-16 w-auto rounded border object-contain p-1"
                  />
                ) : null}
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="companyAddress">Company Address *</Label>
              <Textarea
                id="companyAddress"
                value={formData.companyAddress}
                onChange={(e) =>
                  setFormData({ ...formData, companyAddress: e.target.value })
                }
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) =>
                    setFormData({ ...formData, phone: e.target.value })
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="fax">Fax</Label>
                <Input
                  id="fax"
                  value={formData.fax}
                  onChange={(e) => setFormData({ ...formData, fax: e.target.value })}
                />
              </div>
            </div>

            <div className="border rounded-md p-3 space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-medium">Bank Accounts</p>
                <Button type="button" variant="outline" onClick={addBankAccount}>
                  Add Bank Account
                </Button>
              </div>
              <div className="space-y-4">
                {formData.bankAccounts.map((account, index) => (
                  <div key={account.id} className="border rounded-md p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">Account {index + 1}</p>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => removeBankAccount(account.id)}
                        disabled={formData.bankAccounts.length <= 1}
                      >
                        Remove
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label>Label</Label>
                        <Input
                          value={account.label || ''}
                          onChange={(e) =>
                            updateBankAccount(account.id, { label: e.target.value })
                          }
                          placeholder="e.g. Main, Secondary"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>Bank Name</Label>
                        <Input
                          value={account.bankName || ''}
                          onChange={(e) =>
                            updateBankAccount(account.id, { bankName: e.target.value })
                          }
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>Branch</Label>
                        <Input
                          value={account.branch || ''}
                          onChange={(e) =>
                            updateBankAccount(account.id, { branch: e.target.value })
                          }
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>Swift Code</Label>
                        <Input
                          value={account.swiftCode || ''}
                          onChange={(e) =>
                            updateBankAccount(account.id, { swiftCode: e.target.value })
                          }
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>Account Name</Label>
                        <Input
                          value={account.accountName || ''}
                          onChange={(e) =>
                            updateBankAccount(account.id, { accountName: e.target.value })
                          }
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>Account Type</Label>
                        <Input
                          value={account.accountType || ''}
                          onChange={(e) =>
                            updateBankAccount(account.id, { accountType: e.target.value })
                          }
                        />
                      </div>
                    </div>

                    <div className="grid gap-2">
                      <Label>Account Number</Label>
                      <Input
                        value={account.accountNumber || ''}
                        onChange={(e) =>
                          updateBankAccount(account.id, { accountNumber: e.target.value })
                        }
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label>Bank Address</Label>
                      <Textarea
                        value={account.bankAddress || ''}
                        onChange={(e) =>
                          updateBankAccount(account.id, { bankAddress: e.target.value })
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="signatoryName">Signatory Name</Label>
                <Input
                  id="signatoryName"
                  value={formData.signatoryName}
                  onChange={(e) =>
                    setFormData({ ...formData, signatoryName: e.target.value })
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="signatoryTitle">Signatory Title</Label>
                <Input
                  id="signatoryTitle"
                  value={formData.signatoryTitle}
                  onChange={(e) =>
                    setFormData({ ...formData, signatoryTitle: e.target.value })
                  }
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="bankNotes">Bank Notes</Label>
              <Textarea
                id="bankNotes"
                value={formData.bankNotes}
                onChange={(e) =>
                  setFormData({ ...formData, bankNotes: e.target.value })
                }
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="footerNotes">Footer Notes</Label>
              <Textarea
                id="footerNotes"
                value={formData.footerNotes}
                onChange={(e) =>
                  setFormData({ ...formData, footerNotes: e.target.value })
                }
              />
            </div>

            <div className="flex justify-end">
              <Button type="submit" isLoading={isSaving}>
                Save Metadata
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
