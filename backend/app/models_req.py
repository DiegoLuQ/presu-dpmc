from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Text, Float
from sqlalchemy.orm import relationship, declarative_base
from datetime import datetime

Base = declarative_base()

class EstadoDetalle(Base):
    __tablename__ = "req_estado"
    id_estado = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(100), nullable=False)

    detalles = relationship("DetalleRequerimiento", back_populates="estado")

class Requerimiento(Base):
    __tablename__ = "req_requerimiento"
    id_requerimiento = Column(Integer, primary_key=True, index=True)
    numero = Column(String(50), unique=True, nullable=False)
    id_usuario = Column(Integer, ForeignKey("auth_usuario.id_user"))
    id_actividad = Column(Integer, ForeignKey("pre_actividad.id_actividad"))
    fecha = Column(DateTime, default=datetime.utcnow)
    para = Column(String(255))
    estado = Column(String(50), default="Pendiente")

    usuario = relationship("User", back_populates=None)
    actividad = relationship("Actividad", back_populates=None)
    detalles = relationship("DetalleRequerimiento", back_populates="requerimiento")
    imagenes = relationship("ReqImagen", back_populates="requerimiento")

class DetalleRequerimiento(Base):
    __tablename__ = "req_detalle"
    id_detalle = Column(Integer, primary_key=True, index=True)
    id_requerimiento = Column(Integer, ForeignKey("req_requerimiento.id_requerimiento"))
    lugar = Column(String(255))
    descripcion = Column(Text)
    fecha_hora = Column(String(100))
    justificacion = Column(Text)
    estado = Column(String(50), default="Pendiente")
    precio = Column(Integer, default=0)
    cantidad = Column(Integer, default=1)
    id_estado = Column(Integer, ForeignKey("req_estado.id_estado"))

    requerimiento = relationship("Requerimiento", back_populates="detalles")
    estado_detalle = relationship("EstadoDetalle", back_populates="detalles")

class ReqImagen(Base):
    __tablename__ = "req_imagen"
    id_imagen = Column(Integer, primary_key=True, index=True)
    id_requerimiento = Column(Integer, ForeignKey("req_requerimiento.id_requerimiento"))
    url_img = Column(String(500), nullable=False)

    requerimiento = relationship("Requerimiento", back_populates="imagenes")
