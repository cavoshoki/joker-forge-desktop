import {
  useState,
  useMemo,
  useEffect,
  useDeferredValue,
  useRef,
  ReactNode,
  memo,
} from "react";
import {
  Plus,
  MagnifyingGlass,
  ArrowsDownUp,
  Funnel,
  SquaresFour,
  X,
  CaretDown,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

const MAX_ANIMATED_ITEM_COUNT = 80;
const VIRTUALIZATION_THRESHOLD = 120;
const ESTIMATED_ROW_HEIGHT = 384;
const VIRTUAL_OVERSCAN_ROWS = 2;

export interface SortOption<T> {
  label: string;
  value: string;
  sortFn: (a: T, b: T) => number;
}

export interface FilterOption<T> {
  id: string;
  label: string;
  options: { label: string; value: any }[];
  predicate: (item: T, value: any) => boolean;
}

interface GenericItemPageProps<T> {
  title: string;
  subtitle?: string; // Often the Mod Name
  items: T[];
  searchProps?: {
    placeholder?: string;
    searchFn: (item: T, term: string) => boolean;
  };
  sortOptions: SortOption<T>[];
  defaultSort?: string;
  filterOptions?: FilterOption<T>[];
  onAddNew?: () => void;
  addNewLabel?: string;
  renderCard: (item: T) => ReactNode;
  headerContent?: ReactNode; // For extra custom stats/info if needed
  reforged?: boolean;
  isLoading?: boolean;
}

function GenericItemPageInternal<T extends { id: string }>({
  title,
  subtitle,
  items,
  searchProps,
  sortOptions,
  defaultSort,
  filterOptions,
  onAddNew,
  addNewLabel = "Add New Item",
  renderCard,
  headerContent,
  reforged = false,
  isLoading = false,
}: GenericItemPageProps<T>) {
  const [searchTerm, setSearchTerm] = useState("");
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [currentSort, setCurrentSort] = useState(
    defaultSort || sortOptions[0]?.value,
  );
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [activeFilters, setActiveFilters] = useState<Record<string, any>>({});
  const [isXlLayout, setIsXlLayout] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth >= 1280 : true,
  );
  const [virtualRows, setVirtualRows] = useState({ start: 0, end: 0 });
  const listContainerRef = useRef<HTMLDivElement | null>(null);

  const processedItems = useMemo(() => {
    let result = [...items];

    if (deferredSearchTerm && searchProps) {
      const lowerTerm = deferredSearchTerm.toLowerCase();
      result = result.filter((item) => searchProps.searchFn(item, lowerTerm));
    }

    if (filterOptions) {
      filterOptions.forEach((filter) => {
        const activeValue = activeFilters[filter.id];
        if (activeValue !== undefined && activeValue !== null) {
          result = result.filter((item) => filter.predicate(item, activeValue));
        }
      });
    }

    const sortOpt = sortOptions.find((opt) => opt.value === currentSort);
    if (sortOpt) {
      result.sort(sortOpt.sortFn);
      if (sortDirection === "desc") {
        result.reverse();
      }
    }

    return result;
  }, [
    items,
    deferredSearchTerm,
    currentSort,
    sortDirection,
    activeFilters,
    searchProps,
    filterOptions,
    sortOptions,
  ]);

  const activeFilterCount = Object.values(activeFilters).filter(
    (v) => v !== null,
  ).length;
  const hasActiveSearch = deferredSearchTerm.trim().length > 0;
  const isShowingLoadingState =
    isLoading &&
    items.length === 0 &&
    !hasActiveSearch &&
    activeFilterCount === 0;
  const shouldAnimateCards = processedItems.length <= MAX_ANIMATED_ITEM_COUNT;
  const shouldVirtualize =
    !isShowingLoadingState &&
    !shouldAnimateCards &&
    processedItems.length >= VIRTUALIZATION_THRESHOLD;
  const columnCount = isXlLayout ? 2 : 1;
  const totalRows = Math.ceil(processedItems.length / columnCount);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const onResize = () => {
      setIsXlLayout(window.innerWidth >= 1280);
    };

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!shouldVirtualize) {
      setVirtualRows({
        start: 0,
        end: Math.max(0, totalRows - 1),
      });
      return;
    }

    const updateVirtualRows = () => {
      const container = listContainerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const viewportTop = window.scrollY;
      const viewportBottom = viewportTop + viewportHeight;
      const containerTop = viewportTop + rect.top;

      const relativeTop = Math.max(0, viewportTop - containerTop);
      const relativeBottom = Math.max(0, viewportBottom - containerTop);

      const start = Math.max(
        0,
        Math.floor(relativeTop / ESTIMATED_ROW_HEIGHT) - VIRTUAL_OVERSCAN_ROWS,
      );
      const end = Math.min(
        Math.max(0, totalRows - 1),
        Math.ceil(relativeBottom / ESTIMATED_ROW_HEIGHT) +
          VIRTUAL_OVERSCAN_ROWS,
      );

      setVirtualRows((prev) =>
        prev.start === start && prev.end === end ? prev : { start, end },
      );
    };

    let frameId = 0;
    const scheduleUpdate = () => {
      if (frameId) return;
      frameId = window.requestAnimationFrame(() => {
        frameId = 0;
        updateVirtualRows();
      });
    };

    updateVirtualRows();

    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    return () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, [shouldVirtualize, totalRows]);

  const { startIndex, endIndex, topSpacerHeight, bottomSpacerHeight } =
    useMemo(() => {
      if (!shouldVirtualize) {
        return {
          startIndex: 0,
          endIndex: processedItems.length,
          topSpacerHeight: 0,
          bottomSpacerHeight: 0,
        };
      }

      const startIndex = virtualRows.start * columnCount;
      const endIndex = Math.min(
        processedItems.length,
        (virtualRows.end + 1) * columnCount,
      );
      const topSpacerHeight = virtualRows.start * ESTIMATED_ROW_HEIGHT;
      const bottomSpacerHeight = Math.max(
        0,
        (totalRows - virtualRows.end - 1) * ESTIMATED_ROW_HEIGHT,
      );

      return {
        startIndex,
        endIndex,
        topSpacerHeight,
        bottomSpacerHeight,
      };
    }, [
      shouldVirtualize,
      virtualRows.start,
      virtualRows.end,
      columnCount,
      processedItems.length,
      totalRows,
    ]);

  const renderedItems = useMemo(
    () => processedItems.slice(startIndex, endIndex),
    [processedItems, startIndex, endIndex],
  );

  const skeletonCards = Array.from({ length: 6 }, (_, index) => (
    <div
      key={`skeleton-${index}`}
      className="rounded-3xl bg-card p-6 h-90 flex flex-col gap-4"
    >
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-xl" />
        <Skeleton className="h-6 w-2/5" />
      </div>
      <Skeleton className="h-48 w-full rounded-2xl" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
      <div className="flex gap-2 mt-auto">
        <Skeleton className="h-9 w-24 rounded-xl" />
        <Skeleton className="h-9 w-24 rounded-xl" />
      </div>
    </div>
  ));

  return (
    <div className="space-y-10 max-w-7xl mx-auto pb-20">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div className="space-y-2">
          <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <SquaresFour weight="fill" className="h-4 w-4 text-primary" />
            {reforged ? "Reference View" : "Collection View"}
            {reforged && (
              <Badge variant="secondary" className="text-[10px] uppercase">
                Read Only
              </Badge>
            )}
          </h2>
          <div className="flex items-center gap-4">
            <h1 className="text-5xl font-bold tracking-tight text-foreground">
              {title}
            </h1>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground font-medium pt-1">
            <span className="text-foreground">{subtitle}</span>
            <div className="h-1 w-1 rounded-full bg-border" />
            <span>
              {isShowingLoadingState
                ? "Loading items..."
                : `${processedItems.length} of ${items.length} items`}
            </span>
          </div>
        </div>

        {onAddNew && !reforged && (
          <Button
            onClick={onAddNew}
            size="lg"
            className="font-bold shadow-md cursor-pointer transition-colors"
          >
            <Plus className="mr-2 h-5 w-5" weight="bold" />
            {addNewLabel}
          </Button>
        )}
      </div>

      {reforged && (
        <div className="rounded-2xl bg-card/60 px-4 py-3 text-sm text-muted-foreground">
          Reference data only. Use the copy button on any card to add it to your
          project.
        </div>
      )}

      <div className="border-b border-border w-full" />

      {/* Toolbar Section */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1 group">
          <MagnifyingGlass
            className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors"
            weight="bold"
          />
          <Input
            placeholder={searchProps?.placeholder || "Search items..."}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-12 bg-card border-border hover:border-primary/50 focus:border-primary h-12 text-lg shadow-sm transition-all rounded-xl"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1 cursor-pointer"
            >
              <X className="h-4 w-4" weight="bold" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="gap-3 h-12 px-4 bg-card border-border hover:bg-accent hover:border-primary/50 text-foreground font-medium shadow-sm transition-all rounded-xl min-w-45 justify-between cursor-pointer group"
              >
                <span className="flex items-center gap-2">
                  <ArrowsDownUp
                    className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors"
                    weight="duotone"
                  />
                  <span className="truncate">
                    {sortOptions.find((s) => s.value === currentSort)?.label}
                  </span>
                </span>
                <CaretDown
                  className="h-4 w-4 text-muted-foreground opacity-50"
                  weight="bold"
                />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-56 rounded-xl border-border bg-card p-2"
            >
              <div className="px-2 py-2 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Sort By
              </div>
              {sortOptions.map((opt) => (
                <DropdownMenuItem
                  key={opt.value}
                  onClick={() => setCurrentSort(opt.value)}
                  className="cursor-pointer rounded-lg focus:bg-accent focus:text-accent-foreground py-2 font-medium"
                >
                  {opt.label}
                  {currentSort === opt.value && (
                    <div className="ml-auto w-2 h-2 rounded-full bg-primary" />
                  )}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator className="my-2 bg-border/50" />
              <DropdownMenuItem
                onClick={() =>
                  setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"))
                }
                className="cursor-pointer rounded-lg focus:bg-accent focus:text-accent-foreground py-2 font-medium"
              >
                {sortDirection === "asc"
                  ? "Ascending (Low to High)"
                  : "Descending (High to Low)"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {filterOptions && filterOptions.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant={activeFilterCount > 0 ? "secondary" : "outline"}
                  className={cn(
                    "gap-2 h-12 px-4 bg-card border-border hover:bg-accent hover:border-primary/50 font-medium shadow-sm transition-all rounded-xl cursor-pointer group",
                    activeFilterCount > 0 &&
                      "bg-primary/10 text-primary border-primary/20 hover:bg-primary/20",
                  )}
                >
                  <Funnel
                    className={cn(
                      "h-5 w-5 transition-colors",
                      activeFilterCount > 0
                        ? "text-primary"
                        : "text-muted-foreground group-hover:text-primary",
                    )}
                    weight={activeFilterCount > 0 ? "fill" : "duotone"}
                  />
                  Filters
                  {activeFilterCount > 0 && (
                    <Badge
                      variant="secondary"
                      className="ml-1 h-5 min-w-5 px-1.5 flex items-center justify-center bg-background text-foreground shadow-none border border-border rounded-md"
                    >
                      {activeFilterCount}
                    </Badge>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-64 rounded-xl border-border bg-card p-2"
              >
                {filterOptions.map((group) => (
                  <div key={group.id} className="mb-2 last:mb-0">
                    <div className="px-2 py-2 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      {group.label}
                    </div>
                    {group.options.map((opt) => (
                      <DropdownMenuCheckboxItem
                        key={`${group.id}-${opt.value}`}
                        checked={activeFilters[group.id] === opt.value}
                        onCheckedChange={(checked) => {
                          setActiveFilters((prev) => {
                            const next = { ...prev };
                            if (checked) next[group.id] = opt.value;
                            else delete next[group.id];
                            return next;
                          });
                        }}
                        className="cursor-pointer rounded-lg py-2 font-medium"
                      >
                        {opt.label}
                      </DropdownMenuCheckboxItem>
                    ))}
                    <DropdownMenuSeparator className="my-2 bg-border/50" />
                  </div>
                ))}
                <DropdownMenuItem
                  className="justify-center text-primary font-bold cursor-pointer rounded-lg py-2 hover:bg-primary/10 focus:bg-primary/10 focus:text-primary"
                  onClick={() => setActiveFilters({})}
                >
                  Clear All Filters
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Header Extra Content (Optional) */}
      {headerContent && <div className="py-2">{headerContent}</div>}

      {/* Grid Content */}
      {isShowingLoadingState ? (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {skeletonCards}
        </div>
      ) : processedItems.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-32 text-center border-2 border-dashed border-border rounded-2xl bg-card/30"
        >
          <div className="h-20 w-20 rounded-full bg-muted/50 flex items-center justify-center mb-6">
            <MagnifyingGlass
              className="h-10 w-10 text-muted-foreground/50"
              weight="duotone"
            />
          </div>
          <h3 className="text-xl font-bold text-foreground">No items found</h3>
          <p className="text-muted-foreground max-w-md mt-2">
            We couldn't find anything matching your search. Try adjusting your
            filters or creating a new item.
          </p>
          <Button
            variant="link"
            onClick={() => {
              setSearchTerm("");
              setActiveFilters({});
            }}
            className="mt-6 text-primary font-bold cursor-pointer"
          >
            Clear all filters
          </Button>
        </motion.div>
      ) : (
        <>
          <div ref={listContainerRef}>
            {topSpacerHeight > 0 && (
              <div style={{ height: topSpacerHeight }} aria-hidden="true" />
            )}

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {shouldAnimateCards && !shouldVirtualize ? (
                <AnimatePresence mode="popLayout">
                  {renderedItems.map((item) => (
                    <motion.div
                      key={item.id}
                      layout
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                      transition={{ duration: 0.2 }}
                    >
                      {renderCard(item)}
                    </motion.div>
                  ))}
                </AnimatePresence>
              ) : (
                renderedItems.map((item) => (
                  <div key={item.id}>{renderCard(item)}</div>
                ))
              )}
            </div>

            {bottomSpacerHeight > 0 && (
              <div style={{ height: bottomSpacerHeight }} aria-hidden="true" />
            )}
          </div>
        </>
      )}
    </div>
  );
}

export const GenericItemPage = memo(
  GenericItemPageInternal,
) as typeof GenericItemPageInternal;
