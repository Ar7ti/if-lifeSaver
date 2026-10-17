import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useWorkspace } from '@/features/workspace/context';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import { ErrorState } from '@/components/ui/States';
import { parseEuros } from '@/lib/format';
import { toast } from '@/stores/toast';

/** Adds a person's own estimate to the plan. The server marks it as estimated. */
export function ManualItemDialog({ open, onClose, defaultCategory }: { open: boolean; onClose: () => void; defaultCategory?: string }) {
  const { project, writer } = useWorkspace();
  const categories = project.budget.categories;
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState(defaultCategory ?? categories[0]?.id ?? 'other');
  const [price, setPrice] = useState('');
  const [delivery, setDelivery] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [url, setUrl] = useState('');
  const [tried, setTried] = useState(false);

  const priceMinor = parseEuros(price);
  const deliveryMinor = delivery.trim() === '' ? null : parseEuros(delivery);
  const qty = Number(quantity);
  const urlOk = url.trim() === '' || /^https:\/\/[^\s/]+\.[^\s]+$/.test(url.trim());
  const valid = title.trim().length > 0 && priceMinor !== null && Number.isInteger(qty) && qty >= 1 && qty <= 100 && (delivery.trim() === '' || deliveryMinor !== null) && urlOk;

  const add = useMutation({
    mutationFn: () =>
      writer.api.addCartItem(project.id, {
        title: title.trim(),
        category,
        unitPriceMinor: priceMinor!,
        deliveryCostMinor: deliveryMinor,
        quantity: qty,
        status: 'selected',
        sourceUrl: url.trim() || null,
      }),
    onSuccess: res => {
      writer.applyCart(res);
      toast.success('Estimate added to your plan', 'Nothing has been bought.');
      setTitle('');
      setPrice('');
      setDelivery('');
      setQuantity('1');
      setUrl('');
      onClose();
    },
    onError: writer.reloadOnConflict,
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add your own estimate"
      description="For something you found yourself or a price you expect to pay. It is marked as an estimate."
      footer={
        <>
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={add.isPending} onClick={() => { if (!valid) { setTried(true); requestAnimationFrame(() => document.querySelector<HTMLElement>('dialog[open] [aria-invalid="true"]')?.focus()); } else add.mutate(); }}>
            Add to plan
          </Button>
        </>
      }
    >
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={e => {
          e.preventDefault();
          if (valid) add.mutate();
          else {
            setTried(true);
            requestAnimationFrame(() => document.querySelector<HTMLElement>('dialog[open] [aria-invalid="true"]')?.focus());
          }
        }}
      >
        <Field label="What is it?" className="sm:col-span-2" hint={tried && !title.trim() ? 'Give the item a name.' : undefined}>
          {p => <Input {...p} value={title} maxLength={200} onChange={e => setTitle(e.target.value)} placeholder="e.g. Second-hand wardrobe" aria-invalid={tried && !title.trim()} />}
        </Field>
        <Field label="Budget category">
          {p => (
            <Select {...p} value={category} onChange={e => setCategory(e.target.value)}>
              {categories.map(c => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
              {categories.length === 0 && <option value="other">Other</option>}
            </Select>
          )}
        </Field>
        <Field label="Quantity">
          {p => <Input {...p} type="number" min={1} max={100} value={quantity} onChange={e => setQuantity(e.target.value)} />}
        </Field>
        <Field label="Price each (€)" hint={tried && priceMinor === null ? 'Enter a price, e.g. 49 or 49.90.' : undefined}>
          {p => <Input {...p} inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} placeholder="0" aria-invalid={tried && priceMinor === null} />}
        </Field>
        <Field label="Delivery (€)" hint="Leave empty if unknown.">
          {p => <Input {...p} inputMode="decimal" value={delivery} onChange={e => setDelivery(e.target.value)} placeholder="Unknown" />}
        </Field>
        <Field label="Link (optional)" className="sm:col-span-2" hint={urlOk ? 'A public https:// link to the listing.' : 'Use a full https:// link.'}>
          {p => <Input {...p} type="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://" aria-invalid={!urlOk} />}
        </Field>
        <button type="submit" hidden />
        {add.isError && <ErrorState error={add.error} className="sm:col-span-2" />}
      </form>
    </Dialog>
  );
}
