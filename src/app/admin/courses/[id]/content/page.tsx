import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requirePermission } from "@/lib/auth/guards";
import { getCourseContent } from "@/lib/data/learning";
import { PageHeader } from "@/components/page-header";
import { ContentManager } from "@/components/learning/content-manager";

export default async function AdminCourseContentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("lesson.manage");
  const { id } = await params;
  const content = await getCourseContent(id);
  if (!content) notFound();

  return (
    <>
      <div className="mb-4">
        <Link
          href={`/admin/courses/${id}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to course
        </Link>
      </div>
      <PageHeader
        title={`Content — ${content.course.title}`}
        description="Modules, lessons and resources. Published lessons are visible to enrolled students."
      />
      <ContentManager content={content} />
    </>
  );
}
