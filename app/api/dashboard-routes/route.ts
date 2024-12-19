import { authOptions } from "@/auth";
import { getServerSession } from "next-auth";
import prisma from "@/lib/db";
import { Status } from "@prisma/client";
import { ticketMetadata } from "@/prisma/ticketMetadata";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return new Response(JSON.stringify({ message: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { searchParams } = new URL(request.url);
  const route = searchParams.get("route");

  switch (route) {
    case "summary":
      return getSummary();
    case "resolution-rate":
      return getResolutionRate();
    case "monthly-summary":
      return getMonthlySummary();
    case "by-category":
      return getByCategory();
    case "technician-performance":
      return getTechnicianPerformance();
    case "company-summary":
      return getCompanySummary();
    case "recent-tickets":
      return getRecentTickets();
    default:
      return new Response(JSON.stringify({ message: "Invalid route" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
  }
}

async function getRecentTickets() {
  try {
    const tickets = await prisma.ticket.findMany({
      orderBy: {
        createdAt: "desc",
      },
      take: 5, // Obtener los 5 tickets más recientes
    });

    return new Response(JSON.stringify(tickets), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error(error);
    return new Response(
      JSON.stringify({
        message: "Hubo un error al obtener los tickets recientes",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

async function getSummary() {
  try {
    const totalTickets = await prisma.ticket.count();
    const pendingTickets = await prisma.ticket.count({
      where: { status: Status.Open },
    });
    const completedTickets = await prisma.ticket.count({
      where: { status: Status.Closed },
    });

    return new Response(
      JSON.stringify({
        totalTickets,
        pendingTickets,
        completedTickets,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error(error);
    return new Response(
      JSON.stringify({
        message: "Hubo un error al obtener el resumen de tickets",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

async function getResolutionRate() {
  try {
    const totalTickets = await prisma.ticket.count();
    const completedTickets = await prisma.ticket.count({
      where: { status: Status.Closed },
    });
    const resolutionRate = (completedTickets / totalTickets) * 100;

    return new Response(JSON.stringify({ resolutionRate }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error(error);
    return new Response(
      JSON.stringify({
        message: "Hubo un error al obtener la tasa de resolución",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

async function getMonthlySummary() {
  try {
    const monthlyData = await prisma.ticket.groupBy({
      by: ["createdAt"],
      _count: {
        _all: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    // Transform the data to group by month
    const monthlySummary = monthlyData.reduce(
      (acc: { [key: string]: { month: string; tickets: number } }, item) => {
        const month = item.createdAt.toISOString().slice(0, 7); // Get YYYY-MM format
        if (!acc[month]) {
          acc[month] = { month, tickets: 0 };
        }
        acc[month].tickets += item._count._all;
        return acc;
      },
      {}
    );

    return new Response(JSON.stringify(Object.values(monthlySummary)), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error(error);
    return new Response(
      JSON.stringify({
        message: "Hubo un error al obtener el resumen mensual de tickets",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

async function getByCategory() {
  try {
    const ticketsByCategory = await prisma.ticket.groupBy({
      by: ["type"],
      _count: {
        _all: true,
      },
    });

    const result = ticketsByCategory.map((item) => ({
      type: ticketMetadata.type[item.type as keyof typeof ticketMetadata.type]
        .text,
      _count: item._count,
      color:
        ticketMetadata.type[item.type as keyof typeof ticketMetadata.type]
          .color,
      icon: ticketMetadata.type[item.type as keyof typeof ticketMetadata.type]
        .icon,
    }));

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error(error);
    return new Response(
      JSON.stringify({
        message: "Hubo un error al obtener el desglose por categoría",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

async function getTechnicianPerformance() {
  try {
    const monthlySummaryRaw = await prisma.ticket.groupBy({
      by: ["userId"],
      _count: {
        _all: true,
      },
    });

    const monthlySummary = monthlySummaryRaw.filter(
      (item) => item.userId !== null
    );

    const result = await Promise.all(
      monthlySummary.map(async (item) => {
        const user = await prisma.person.findUnique({
          where: { id: item.userId as number },
        });

        if (!user) return null;

        const completedTickets = await prisma.ticket.count({
          where: {
            userId: item.userId,
            status: Status.Closed,
          },
        });

        const pendingTickets = await prisma.ticket.count({
          where: {
            userId: item.userId,
            status: Status.Open,
          },
        });

        return {
          name: `${user.firstName} ${user.lastName}`,
          total: item._count._all,
          completed: completedTickets,
          pending: pendingTickets,
        };
      })
    );

    return new Response(JSON.stringify(result.filter(Boolean)), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error(error);
    return new Response(
      JSON.stringify({
        message: "Hubo un error al obtener el rendimiento de los técnicos",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

async function getCompanySummary() {
  try {
    const ticketsByCompany = await prisma.ticket.groupBy({
      by: ["clientId"],
      _count: {
        _all: true,
        status: true,
      },
    });

    const result = await Promise.all(
      ticketsByCompany.map(async (item) => {
        const client = await prisma.person.findUnique({
          where: { id: item.clientId },
        });
        const completedTickets = await prisma.ticket.count({
          where: {
            clientId: item.clientId,
            status: Status.Closed,
          },
        });
        const pendingTickets = await prisma.ticket.count({
          where: {
            clientId: item.clientId,
            status: Status.Open,
          },
        });
        return {
          name: client ? `${client.firstName} ${client.lastName}` : "Unknown",
          completed: completedTickets,
          pending: pendingTickets,
        };
      })
    );

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error(error);
    return new Response(
      JSON.stringify({
        message: "Hubo un error al obtener el resumen por empresa",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
