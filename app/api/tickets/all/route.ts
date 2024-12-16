import { authOptions } from "@/auth";
import { getServerSession } from "next-auth";
import prisma from "@/lib/db";
import { translations } from "@/prisma/translations";

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session || session.user.role !== "Admin") {
    return new Response(JSON.stringify({ message: "No autorizado" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const tickets = await prisma.ticket.findMany({
      include: {
        client: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        user: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    const formattedTickets = tickets.map((ticket) => ({
      id: ticket.id,
      title: ticket.title,
      type: translations.type[ticket.type],
      status: translations.status[ticket.status],
      priority: translations.priority[ticket.priority],
      createdAt: new Date(ticket.createdAt),
      updatedAt: new Date(ticket.updatedAt),
      clientName: ticket.client.firstName + ' ' + ticket.client.lastName,
      assignedTo: ticket.user?.firstName + ' ' + ticket.user?.lastName || null,
    }));

    return new Response(JSON.stringify(formattedTickets), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error(error);
    return new Response(
      JSON.stringify({ message: "Error al obtener los tickets" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
